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

;; Data variables
(define-data-var contract-owner principal tx-sender)
(define-data-var is-paused bool false)
(define-data-var min-deposit-amount uint u1000000) ;; 1 sBTC minimum (6 decimals)
(define-data-var total-sbtc-locked uint u0)

;; User deposit tracking (simplified - no property-specific logic)
(define-map user-sbtc-deposits {user: principal} uint)
(define-map user-deposit-timestamps {user: principal} uint)

;; Stacks address to EVM custodian mapping (self-registration)
(define-map stacks-to-evm-custodian {stacks-address: principal} principal)

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

;; Self-register Stacks address to EVM custodian mapping
(define-public (register-stacks-address (evm-custodian principal))
  (if (is-none (map-get? stacks-to-evm-custodian {stacks-address: tx-sender}))
    (ok (begin
      ;; Register the mapping (user registers their own Stacks address)
      (map-set stacks-to-evm-custodian {stacks-address: tx-sender} evm-custodian)
      
      ;; Emit event for cross-chain relayer
      (print "register:addresses-registered")
      
      true))
    (err ERR-STACKS-ADDRESS-ALREADY-REGISTERED)))

;; Simplified sBTC deposit function - transfers sBTC to contract
(define-public (deposit-sbtc (amount uint))
  (if (and 
        (not (var-get is-paused))
        (>= amount (var-get min-deposit-amount))
        (is-some (map-get? stacks-to-evm-custodian {stacks-address: tx-sender})))
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
        
        ;; Record deposit timestamp
        (map-set user-deposit-timestamps {user: tx-sender} u0)
        
        ;; Emit deposit event for cross-chain relayer (Type 1: deposit)
        ;; This will trigger OFTUSDC minting to the user's EVM custodian address
        (print "deposit:event-emitted")
        
        true))
      err-code (err ERR-TRANSFER-FAILED))
    (err (if (var-get is-paused) ERR-CONTRACT-PAUSED
           (if (< amount (var-get min-deposit-amount)) ERR-INVALID-AMOUNT
             ERR-STACKS-ADDRESS-NOT-REGISTERED)))))

;; Note: No withdrawal functions - users cannot withdraw sBTC back
;; Once sBTC is deposited, it's locked and OFTUSDC is minted on EVM
;; Users can only use OFTUSDC for investments on the platform

;; Read functions
(define-read-only (get-user-sbtc-deposits (user principal))
  (ok (default-to u0 (map-get? user-sbtc-deposits {user: user}))))

(define-read-only (get-user-deposit-timestamp (user principal))
  (ok (default-to u0 (map-get? user-deposit-timestamps {user: user}))))

(define-read-only (get-total-sbtc-locked)
  (ok (var-get total-sbtc-locked)))

(define-read-only (get-evm-custodian (stacks-address principal))
  (ok (default-to tx-sender (map-get? stacks-to-evm-custodian {stacks-address: stacks-address}))))

(define-read-only (is-stacks-address-registered (stacks-address principal))
  (ok (is-some (map-get? stacks-to-evm-custodian {stacks-address: stacks-address}))))

(define-read-only (get-min-deposit-amount)
  (ok (var-get min-deposit-amount)))

(define-read-only (get-contract-owner)
  (ok (var-get contract-owner)))

(define-read-only (is-contract-paused)
  (ok (var-get is-paused)))

;; Demo/Status function for testing
(define-read-only (get-demo-status)
  (ok (tuple 
    (is-paused (var-get is-paused))
    (total-sbtc-locked (var-get total-sbtc-locked))
    (min-deposit (var-get min-deposit-amount)))))