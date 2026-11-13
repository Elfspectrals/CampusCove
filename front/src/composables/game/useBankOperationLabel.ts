import { useI18n } from 'vue-i18n'
import type { BankOperation } from '../../api/bank'

export function useBankOperationLabel(): (op: BankOperation) => string {
  const { t, te } = useI18n()
  return (op) => {
    if (op.reason === 'bank_transfer_out') return t('atm.reasons.bank_transfer_out', { name: op.to ?? '?' })
    if (op.reason === 'bank_transfer_in') return t('atm.reasons.bank_transfer_in', { name: op.from ?? '?' })
    const key = `atm.reasons.${op.reason}`
    return te(key) ? t(key) : op.reason.replace(/_/g, ' ')
  }
}
