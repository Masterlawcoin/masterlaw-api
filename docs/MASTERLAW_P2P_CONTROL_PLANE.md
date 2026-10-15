# Masterlaw P2P Control Plane

> Status: implementation branch / testnet only.
>
> This integration reuses the existing Masterlaw `usuarios.id`. It does not create a second exchange identity system and it does not execute the prepared SQL migration automatically.

## Product boundary

- **Masterlaw**: identity, KYC/compliance status, wallet ownership records, case management, evidence, mediation, staff review and audit trail.
- **MasterlawEX**: trading/P2P UX.
- **ARC**: USDC escrow and verifiable settlement state.
- **Masterlaw multisig/smart-account**: human-approved arbitration execution.
- **AI**: read/summarize/score/recommend only; never signs or moves funds.

## Current safe endpoint

The isolated Vercel function exposes:

- `GET /api/exchange/p2p/health`
- `GET /api/exchange/p2p/policy`
- `GET /api/exchange/p2p/access` — requires the existing Masterlaw JWT.

`/access` loads the existing `usuarios` row and fails closed unless the account is active and KYC is `VERIFIED` and unexpired.

No endpoint in this first control-plane step writes to the database.

## KYC gate

The exchange should treat these as non-operable:

- missing KYC fields
- `REGISTERED`
- `KYC_PENDING`
- `ENHANCED_REVIEW`
- `BLOCKED`
- `REJECTED`
- `EXPIRED`
- inactive Masterlaw account
- `p2p_blocked = true`

Only `VERIFIED` passes the current real-P2P eligibility check.

Even when KYC is verified, the current API reports `real_money_enabled: false` until wallet binding, V1.4 escrow deployment, reconciliation and production/compliance gates are completed.

## Wallet binding

The prepared database model adds `p2p_wallet_links`, keyed to `usuarios.id` and ARC chain `5042002`.

A future write endpoint must:

1. issue a short-lived nonce/challenge bound to the authenticated Masterlaw user;
2. require an ARC wallet signature;
3. recover and verify the wallet address server-side;
4. reject a wallet already actively bound to another identity unless reviewed;
5. write the verified link with an immutable audit event.

Do not store wallet private keys or seed phrases.

## Mediation case

A private Masterlaw `p2p_cases` record binds:

- Masterlaw buyer/seller user ids
- buyer/seller ARC wallets
- backend trade id
- ARC escrow address
- ARC trade id
- orderRef
- amount in base units
- private risk/KYC snapshot
- case hash
- resolution/agreement hash
- execution transaction hash

Raw KYC documents and payment evidence stay in private controlled storage. ARC receives only opaque hashes.

## Case state machine

```text
OPENED
  -> EVIDENCE_REQUESTED
  -> UNDER_REVIEW
  -> MEDIATION_PROPOSED
     -> AGREEMENT_PENDING_SIGNATURES
     -> ARBITRATION_PENDING
  -> RESOLUTION_APPROVED
  -> ONCHAIN_EXECUTION_PENDING
  -> EXECUTED
  -> CLOSED
```

`BLOCKED` is available for compliance/technical holds.

## ARC V1.4 actions

Masterlaw staff does not directly transfer arbitrary escrow funds.

The intended V1.4 contract gives the configured arbiter/multisig only these targeted powers:

- freeze one trade with `openDisputeByArbiter(tradeId, caseHash)`
- binary resolution with `resolveDispute(tradeId, releaseToBuyer, resolutionHash)`
- pause creation of new escrows
- rotate arbiter using the existing two-step mechanism

A partial settlement is controlled by the users themselves: one participant proposes the exact split and the counterparty must approve the identical proposal on-chain. The arbiter cannot unilaterally invent a partial split.

## Before enabling database writes

Review and explicitly approve `migrations/2026-10-15_masterlaw_p2p_control_plane.sql` against the actual production schema.

Before execution verify:

- `usuarios.id` type and foreign-key compatibility
- existing KYC fields/naming to avoid duplicates
- RLS model and service-role boundaries
- private storage location for evidence
- retention/deletion policy
- staff roles (`compliance`, `mediador`, `abogado`, `admin` or final equivalents)
- audit log immutability requirements

No migration should be auto-applied from GitHub Actions or Vercel deploys.

## Production gate

Real-money P2P remains disabled until:

1. Masterlaw KYC/AML flow is implemented and tested;
2. wallet binding is persistent and auditable;
3. V1.4 receives independent smart-contract review/audit;
4. arbiter is a tested multisig/smart-account, not a single EOA;
5. backend trade ↔ ARC trade reconciliation is implemented;
6. mediation/evidence workflow is implemented;
7. incident response, pause and key-management procedures are tested;
8. legal/regulatory readiness is confirmed for the operating model.
