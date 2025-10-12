;; SPDX-License-Identifier: MIT
;; BrickVault Gateway - Simplified sBTC Deposits
;; Handles sBTC deposits with cross-chain OFTUSDC minting
;; Simplified workflow: sBTC deposit to OFTUSDC minted to custodian address
;; No property-specific logic, no stage transitions, no withdrawals back to sBTC

;; Error constants
(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-NOT-OWNER (err u101))
(define-constant ERR-INVALID-AMOUNT (err u102))
(define-constant ERR-INSUFFICIENT-BALANCE (err u105))
(define-constant ERR-CONTRACT-PAUSED (err u107))
(define-constant ERR-STACKS-ADDRESS-ALREADY-REGISTERED (err u108))
(define-constant ERR-STACKS-ADDRESS-NOT-REGISTERED (err u109))
(define-constant ERR-TRANSFER-FAILED (err u110))
(define-constant ERR-INSUFFICIENT-POOL (err u111))

;; Data variables
(define-data-var contract-owner principal tx-sender)
(define-data-var is-paused bool false)
(define-data-var min-deposit-amount uint u10000000) ;; 0.1 sBTC minimum (8 decimals: 10,000,000 = 0.1 sBTC)
(define-data-var total-sbtc-locked uint u0)

;; Pool management (mirrors EVM pool)
(define-data-var pool-amount-usd uint u0) ;; Available pool in USD (6 decimals: 1 USD = 1,000,000)
(define-data-var sbtc-price-usd uint u9500000000000) ;; sBTC price in USD (8 decimals: $95,000 = 9,500,000,000,000)

;; User deposit tracking (simplified - no property-specific logic)
(define-map user-sbtc-deposits {user: principal} uint)
(define-map user-deposit-timestamps {user: principal} uint)

;; Stacks address to EVM custodian mapping (self-registration)
;; EVM addresses are stored as 20-byte buffers (0x prefixed addresses without the 0x)
(define-map stacks-to-evm-custodian {stacks-address: principal} (buff 20))

;; Owner functions
(define-public (set-min-deposit (amount uint))
  (if (is-eq tx-sender (var-get contract-owner))
    (ok (begin
      (var-set min-deposit-amount amount)
      true))
    (err ERR-NOT-OWNER)))

(define-public (pause-contract)
  (if (is-eq tx-sender (var-get contract-owner))
    (ok (begin
      (var-set is-paused true)
      true))
    (err ERR-NOT-OWNER)))

(define-public (unpause-contract)
  (if (is-eq tx-sender (var-get contract-owner))
    (ok (begin
      (var-set is-paused false)
      true))
    (err ERR-NOT-OWNER)))

(define-public (set-pool-amount-usd (amount uint))
  (if (is-eq tx-sender (var-get contract-owner))
    (ok (begin
      (var-set pool-amount-usd amount)
      true))
    (err ERR-NOT-OWNER)))

(define-public (set-sbtc-price-usd (price uint))
  (if (is-eq tx-sender (var-get contract-owner))
    (ok (begin
      (var-set sbtc-price-usd price)
      true))
    (err ERR-NOT-OWNER)))

;; Owner withdrawal function for managing locked sBTC
(define-public (withdraw-sbtc (amount uint) (recipient principal))
  (let ((current-locked (var-get total-sbtc-locked)))
    (if (is-eq tx-sender (var-get contract-owner))
      (if (> amount u0)
        (match (as-contract (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token transfer 
                 amount 
                 tx-sender 
                 recipient 
                 none))
          transfer-result (ok (begin
            ;; Update total locked if the amount withdrawn is less than or equal to current locked
            (if (<= amount current-locked)
              (var-set total-sbtc-locked (- current-locked amount))
              (var-set total-sbtc-locked u0))
            
            ;; Emit event for tracking
            (print "withdraw:owner-withdrawal")
            
            true))
          err-code (err ERR-TRANSFER-FAILED))
        (err ERR-INVALID-AMOUNT))
      (err ERR-NOT-OWNER))))

;; Helper function to calculate USD value from sBTC amount
;; Matches EVM StacksCrossChainManager calculation logic
;; sBTC token uses 8 decimals (100000000 = 1 sBTC)
;; Price uses 8 decimals (9500000000000 = $95,000)
;; USD pool uses 6 decimals (1000000 = $1)
;; Formula: (sbtc-amount * price) / 10^10 = USD value with 6 decimals
;; Example: (100000000 * 9500000000000) / 10000000000 = 95000000000 = $95,000 in 6 decimals
(define-private (calculate-usd-value (sbtc-amount uint))
  (/ (* sbtc-amount (var-get sbtc-price-usd)) u10000000000))

;; Self-register Stacks address to EVM custodian mapping
;; evm-custodian should be a 20-byte buffer representing the EVM address (without 0x prefix)
(define-public (register-stacks-address (evm-custodian (buff 20)))
  (if (is-none (map-get? stacks-to-evm-custodian {stacks-address: tx-sender}))
    (ok (begin
      ;; Register the mapping (user registers their own Stacks address)
      (map-set stacks-to-evm-custodian {stacks-address: tx-sender} evm-custodian)
      
      ;; Emit event for cross-chain relayer
      (print "register:addresses-registered")
      
      true))
    (err ERR-STACKS-ADDRESS-ALREADY-REGISTERED)))

;; Update EVM custodian address for already registered Stacks address
;; Allows users to change their EVM custodian address
(define-public (update-evm-custodian (new-evm-custodian (buff 20)))
  (if (is-some (map-get? stacks-to-evm-custodian {stacks-address: tx-sender}))
    (ok (begin
      ;; Update the mapping to new EVM custodian
      (map-set stacks-to-evm-custodian {stacks-address: tx-sender} new-evm-custodian)
      
      ;; Emit event for cross-chain relayer
      (print "update:custodian-updated")
      
      true))
    (err ERR-STACKS-ADDRESS-NOT-REGISTERED)))

;; Simplified sBTC deposit function - transfers sBTC to contract
;; Checks pool availability before accepting deposit
(define-public (deposit-sbtc (amount uint))
  (let ((usd-value (calculate-usd-value amount))
        (current-pool (var-get pool-amount-usd)))
    (if (and 
          (not (var-get is-paused))
          (>= amount (var-get min-deposit-amount))
          (is-some (map-get? stacks-to-evm-custodian {stacks-address: tx-sender}))
          (>= current-pool usd-value))
      (match (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token transfer 
               amount 
               tx-sender 
               (as-contract tx-sender) 
               none)
        transfer-result (ok (begin
          ;; Update user deposit record
          (map-set user-sbtc-deposits {user: tx-sender} 
            (+ (default-to u0 (map-get? user-sbtc-deposits {user: tx-sender})) amount))
          
          ;; Update global total
          (var-set total-sbtc-locked (+ (var-get total-sbtc-locked) amount))
          
          ;; Reduce pool amount by USD value of deposit
          (var-set pool-amount-usd (- current-pool usd-value))
          
          ;; Record deposit timestamp
          (map-set user-deposit-timestamps {user: tx-sender} u0)
          
          ;; Emit deposit event for cross-chain relayer (Type 1: deposit)
          ;; This will trigger OFTUSDC minting to the user's EVM custodian address
          (print "deposit:event-emitted")
          
          true))
        err-code (err ERR-TRANSFER-FAILED))
      (err (if (var-get is-paused) ERR-CONTRACT-PAUSED
             (if (< amount (var-get min-deposit-amount)) ERR-INVALID-AMOUNT
               (if (is-none (map-get? stacks-to-evm-custodian {stacks-address: tx-sender})) ERR-STACKS-ADDRESS-NOT-REGISTERED
                 ERR-INSUFFICIENT-POOL)))))))

;; Note: Users cannot withdraw sBTC back
;; Once sBTC is deposited, it's locked and OFTUSDC is minted on EVM
;; Users can only use OFTUSDC for investments on the platform
;; The owner can withdraw sBTC for pool management and cross-chain operations

;; Read functions
(define-read-only (get-user-sbtc-deposits (user principal))
  (ok (default-to u0 (map-get? user-sbtc-deposits {user: user}))))

(define-read-only (get-user-deposit-timestamp (user principal))
  (ok (default-to u0 (map-get? user-deposit-timestamps {user: user}))))

(define-read-only (get-total-sbtc-locked)
  (ok (var-get total-sbtc-locked)))

(define-read-only (get-evm-custodian (stacks-address principal))
  (ok (map-get? stacks-to-evm-custodian {stacks-address: stacks-address})))

(define-read-only (is-stacks-address-registered (stacks-address principal))
  (ok (is-some (map-get? stacks-to-evm-custodian {stacks-address: stacks-address}))))

(define-read-only (get-min-deposit-amount)
  (ok (var-get min-deposit-amount)))

(define-read-only (get-contract-owner)
  (ok (var-get contract-owner)))

(define-read-only (is-contract-paused)
  (ok (var-get is-paused)))

(define-read-only (get-pool-amount-usd)
  (ok (var-get pool-amount-usd)))

(define-read-only (get-sbtc-price-usd)
  (ok (var-get sbtc-price-usd)))

;; Demo/Status function for testing
(define-read-only (get-contract-sbtc-balance)
  (ok (contract-call? 'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token get-balance (as-contract tx-sender))))

(define-read-only (get-demo-status)
  (ok (tuple 
    (is-paused (var-get is-paused))
    (total-sbtc-locked (var-get total-sbtc-locked))
    (min-deposit (var-get min-deposit-amount))
    (pool-amount-usd (var-get pool-amount-usd))
    (sbtc-price-usd (var-get sbtc-price-usd)))))