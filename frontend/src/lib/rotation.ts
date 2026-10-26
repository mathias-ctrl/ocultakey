import type { ItemMeta, ItemRow } from '../types'

export type RotationStatus = 'ok' | 'soon' | 'overdue'

export function getRotationStatus(meta: ItemMeta, item: ItemRow, now = Date.now()) {
  const interval = meta.rotation_interval_days
  if (!interval || interval < 1) return null
  const start = Date.parse(meta.rotation_started_at || item.created_at)
  if (!Number.isFinite(start)) return null
  const duration = interval * 24 * 60 * 60 * 1000
  const remaining = start + duration - now
  const status: RotationStatus = remaining <= 0 ? 'overdue' : remaining <= duration * 0.2 ? 'soon' : 'ok'
  return { status, days: Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000))) }
}

export const rotationColors: Record<RotationStatus, string> = {
  ok: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  soon: 'border-amber-200 bg-amber-50 text-amber-800',
  overdue: 'border-red-200 bg-red-50 text-red-800',
}
