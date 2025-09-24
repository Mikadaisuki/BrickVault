;; SPDX-License-Identifier: MIT
;; BrickVault Gateway - Ultra-Simplified sBTC Deposits
;; Handles sBTC deposits for property vaults with cross-chain integration
;; Based on simplified workflow: only deposit/withdrawal events, no stage transitions

;; Error constants
(define-constant ERR-NOT-AUTHORIZED (err u100))
(define-constant ERR-NOT-OWNER (err u101))
(define-constant ERR-INVALID-AMOUNT (err u102))
(define-constant ERR-PROPERTY-NOT-ACTIVE (err u103))
(define-constant ERR-STAGE-NOT-OPEN (err u104))
(define-constant ERR-INSUFFICIENT-BALANCE (err u105))
(define-constant ERR-CONTRACT-PAUSED (err u107))
(define-constant ERR-STACKS-ADDRESS-ALREADY-REGISTERED (err u108))

;; Data variables
(define-data-var contract-owner principal tx-sender)
(define-data-var is-paused bool false)
(define-data-var min-deposit-amount uint u1000000) ;; 1 sBTC minimum (6 decimals)
(define-data-var total-sbtc-locked uint u0)

;; Property-specific data
(define-map property-active {property-id: uint} bool)
(define-map property-stage {property-id: uint} uint) ;; 0=OpenToFund, 1=Funded, 2=UnderManagement, 3=Liquidating, 4=Liquidated
(define-map property-sbtc-locked {property-id: uint} uint)
(define-map property-user-balances {property-id: uint, user: principal} uint)
(define-map property-user-deposits {property-id: uint, user: principal} uint)
(define-map property-user-timestamps {property-id: uint, user: principal} uint)

;; Stacks address to EVM custodian mapping
(define-map stacks-to-evm-custodian {stacks-address: principal} principal)

;; Owner functions
(define-public (set-min-deposit (amount uint))
  (if (is-eq tx-sender (var-get contract-owner))
    (ok (begin
      (var-set min-deposit-amount amount)
      true))
    (err ERR-NOT-OWNER)))

(define-public (set-property-active (property-id uint) (active bool))
  (if (is-eq tx-sender (var-get contract-owner))
    (ok (begin
      (map-set property-active {property-id: property-id} active)
      true))
    (err ERR-NOT-OWNER)))

(define-public (set-property-stage (property-id uint) (stage uint))
  (if (is-eq tx-sender (var-get contract-owner))
    (ok (begin
      (map-set property-stage {property-id: property-id} stage)
      (print "stage:changed")
      true))
    (err ERR-NOT-OWNER)))

;; Function to be called by relayer when EVM stage changes
(define-public (relayer-update-stage (property-id uint) (stage uint) (proof uint))
  (if (is-eq tx-sender (var-get contract-owner))
    (ok (begin
      (map-set property-stage {property-id: property-id} stage)
      (print "stage:relayer-updated")
      
      ;; Emit acknowledgment event for EVM (message type 3)
      (print "stage:acknowledgment-sent")
      
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

;; Register Stacks address to EVM custodian mapping (one-time setup)
(define-public (register-stacks-address (stacks-address principal) (evm-custodian principal))
  (if (is-none (map-get? stacks-to-evm-custodian {stacks-address: stacks-address}))
    (ok (begin
      ;; Register the mapping
      (map-set stacks-to-evm-custodian {stacks-address: stacks-address} evm-custodian)
      
      ;; Emit event for cross-chain relayer
      (print "register:addresses-registered")
      
      true))
    (err ERR-STACKS-ADDRESS-ALREADY-REGISTERED)))

;; Main deposit function (OpenToFund stage only)
(define-public (deposit-sbtc (property-id uint) (amount uint))
  (if (and 
        (not (var-get is-paused))
        (default-to false (map-get? property-active {property-id: property-id}))
        (is-eq (default-to u0 (map-get? property-stage {property-id: property-id})) u0) ;; Only allow in OpenToFund stage (0)
        (>= amount (var-get min-deposit-amount)))
    (ok (begin
    
      ;; Transfer sBTC from user to contract (this would be done by the user calling the sBTC contract)
      ;; Note: In reality, the user would call the sBTC contract's transfer function to this contract
      ;; This is a simplified version - the actual sBTC transfer would happen in the transaction
      
      ;; Update user balance
      (map-set property-user-balances {property-id: property-id, user: tx-sender} 
        (+ (default-to u0 (map-get? property-user-balances {property-id: property-id, user: tx-sender})) amount))
      
      ;; Update user deposit record
      (map-set property-user-deposits {property-id: property-id, user: tx-sender} 
        (+ (default-to u0 (map-get? property-user-deposits {property-id: property-id, user: tx-sender})) amount))
      
      ;; Update property total
      (map-set property-sbtc-locked {property-id: property-id} 
        (+ (default-to u0 (map-get? property-sbtc-locked {property-id: property-id})) amount))
      
      ;; Update global total
      (var-set total-sbtc-locked (+ (var-get total-sbtc-locked) amount))
      
      ;; Record deposit timestamp
      (map-set property-user-timestamps {property-id: property-id, user: tx-sender} u0)
      
      ;; Emit deposit event for cross-chain relayer (Type 1: deposit)
      (print "deposit:event-emitted")
      
      true))
    (err (if (var-get is-paused) ERR-CONTRACT-PAUSED
           (if (not (default-to false (map-get? property-active {property-id: property-id}))) ERR-PROPERTY-NOT-ACTIVE
             (if (not (is-eq (default-to u0 (map-get? property-stage {property-id: property-id})) u0)) ERR-STAGE-NOT-OPEN
               ERR-INVALID-AMOUNT))))))

;; Withdrawal function (OpenToFund stage only)
(define-public (withdraw-sbtc (property-id uint) (amount uint))
  (if (and 
        (not (var-get is-paused))
        (default-to false (map-get? property-active {property-id: property-id}))
        (is-eq (default-to u0 (map-get? property-stage {property-id: property-id})) u0)) ;; Only allow in OpenToFund stage (0)
    (let ((user-balance (default-to u0 (map-get? property-user-balances {property-id: property-id, user: tx-sender}))))
      (if (>= user-balance amount)
        (ok (begin
          ;; Update user balance
          (map-set property-user-balances {property-id: property-id, user: tx-sender} (- user-balance amount))
          
          ;; Update property total
          (map-set property-sbtc-locked {property-id: property-id} 
            (- (default-to u0 (map-get? property-sbtc-locked {property-id: property-id})) amount))
          
          ;; Update global total
            (var-set total-sbtc-locked (- (var-get total-sbtc-locked) amount))
          
          ;; Emit withdrawal event for cross-chain relayer (Type 2: withdrawal)
          (print "withdrawal:event-emitted")
          
          ;; Note: In reality, the contract would transfer sBTC back to the user here
          ;; This would require the contract to hold sBTC and have transfer capabilities
          
          true))
        (err ERR-INSUFFICIENT-BALANCE)))
    (err (if (var-get is-paused) ERR-CONTRACT-PAUSED
           (if (not (default-to false (map-get? property-active {property-id: property-id}))) ERR-PROPERTY-NOT-ACTIVE
             ERR-STAGE-NOT-OPEN)))))

;; Platform withdrawal (after purchase proposal passes)
(define-public (platform-withdraw-sbtc (property-id uint))
  (if (is-eq tx-sender (var-get contract-owner))
    (let ((total-sbtc (default-to u0 (map-get? property-sbtc-locked {property-id: property-id}))))
      (ok (begin
        ;; Reset property sBTC to 0
        (map-set property-sbtc-locked {property-id: property-id} u0)
        
        ;; Update global total
        (var-set total-sbtc-locked (- (var-get total-sbtc-locked) total-sbtc))
        
        ;; Emit withdrawal event for cross-chain relayer (Type 2: withdrawal)
        (print "withdrawal:platform-event-emitted")
        
        ;; Note: In reality, the contract would transfer sBTC to the platform here
        ;; This would be used for third-party conversion to USD
        
        total-sbtc)))
    (err ERR-NOT-OWNER)))

;; Read functions
(define-read-only (get-user-balance (property-id uint) (user principal))
  (ok (default-to u0 (map-get? property-user-balances {property-id: property-id, user: user}))))

(define-read-only (get-user-deposits (property-id uint) (user principal))
  (ok (default-to u0 (map-get? property-user-deposits {property-id: property-id, user: user}))))

(define-read-only (get-property-sbtc-locked (property-id uint))
  (ok (default-to u0 (map-get? property-sbtc-locked {property-id: property-id}))))

(define-read-only (get-total-sbtc-locked)
  (ok (var-get total-sbtc-locked)))

(define-read-only (is-property-active (property-id uint))
  (ok (default-to false (map-get? property-active {property-id: property-id}))))

(define-read-only (get-property-stage (property-id uint))
  (ok (default-to u0 (map-get? property-stage {property-id: property-id}))))

(define-read-only (get-evm-custodian (stacks-address principal))
  (ok (default-to tx-sender (map-get? stacks-to-evm-custodian {stacks-address: stacks-address}))))

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