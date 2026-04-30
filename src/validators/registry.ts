// ── MOVA Flat Runner — validator registry ─────────────────────────────────────
//
// Maps validator_id → ValidatorFn.
// Only functions in this registry may be called during contract execution.
// To add a new validator: implement it in a contract-specific file,
// then add its id to this registry. No dynamic code allowed.

import type { ValidatorFn } from "../types.js";
import { invoiceValidators    } from "./invoice.js";
import { poValidators         } from "./po.js";
import { tradeValidators      } from "./trade.js";
import { amlValidators        } from "./aml.js";
import { complaintValidators  } from "./complaint.js";
import { complianceValidators } from "./compliance.js";
import { creditValidators     } from "./credit.js";
import { contentFlywheelValidators } from "./content_flywheel.js";
import { supplyChainValidators} from "./supply_chain.js";
import { churnValidators      } from "./churn.js";
import { contractGenValidators} from "./contract_gen.js";

type ValidatorEntry = { id: string; fn: ValidatorFn };

const all: ValidatorEntry[] = [
  ...invoiceValidators,
  ...poValidators,
  ...tradeValidators,
  ...amlValidators,
  ...complaintValidators,
  ...complianceValidators,
  ...creditValidators,
  ...contentFlywheelValidators,
  ...supplyChainValidators,
  ...churnValidators,
  ...contractGenValidators,
];

export const VALIDATOR_REGISTRY = new Map<string, ValidatorFn>(
  all.map(v => [v.id, v.fn])
);

export type { ValidatorFn };
