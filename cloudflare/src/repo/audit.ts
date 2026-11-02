/** Prepared statements for audit; callers retain binding and transaction order. */
export function auditInsertAudit(env: Env) {
  return env.DB.prepare("INSERT INTO audit VALUES(?,?,?,?)");
}
