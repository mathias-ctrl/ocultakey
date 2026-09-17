import { useMemo, useState } from 'react'
import { Copy, RefreshCw } from 'lucide-react'

const LOWER = 'abcdefghijkmnopqrstuvwxyz'
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const DIGITS = '23456789'
const SYMBOLS = '!@#'

function randomIndex(max: number): number {
  const limit = Math.floor(0x100000000 / max) * max
  const buf = new Uint32Array(1)
  do crypto.getRandomValues(buf); while (buf[0] >= limit)
  return buf[0] % max
}
function pick(chars: string) { return chars[randomIndex(chars.length)] }
function shuffle(chars: string[]) { for (let i = chars.length - 1; i > 0; i--) { const j = randomIndex(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]] } return chars.join('') }
function generate(length: number, strong: boolean) {
  if (!strong) return Array.from({ length }, () => pick(LOWER + UPPER + DIGITS)).join('')
  const out = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)]
  const all = LOWER + UPPER + DIGITS + SYMBOLS
  while (out.length < length) out.push(pick(all))
  return shuffle(out)
}

export function PasswordGenerator() {
  const [preset, setPreset] = useState('strong16')
  const [customLength, setCustomLength] = useState(20)
  const [value, setValue] = useState(() => generate(16, true))
  const settings = useMemo(() => preset === 'basic6' ? [6, false] : preset === 'basic10' ? [10, false] : preset === 'strong12' ? [12, true] : preset === 'strong24' ? [24, true] : preset === 'custom' ? [customLength, true] : [16, true], [preset, customLength]) as [number, boolean]
  const regenerate = () => setValue(generate(settings[0], settings[1]))
  const copy = async () => navigator.clipboard.writeText(value)

  return <div className="panel p-4">
    <div className="mb-4 flex items-center justify-between gap-3">
      <div><h3 className="font-semibold">Gerador de senha</h3><p className="mt-1 text-sm text-ink/60">Usa o gerador criptográfico do navegador.</p></div>
      <button className="btn-secondary !px-3" onClick={regenerate}><RefreshCw size={17}/> Gerar</button>
    </div>
    <div className="grid gap-3 sm:grid-cols-[1fr_130px]">
      <select className="input" value={preset} onChange={(e) => setPreset(e.target.value)}>
        <option value="basic6">Basic 6</option><option value="basic10">Basic 10</option><option value="strong12">Strong 12</option><option value="strong16">Strong 16</option><option value="strong24">Strong 24</option><option value="custom">Custom Strong</option>
      </select>
      {preset === 'custom' && <input className="input" type="number" min={8} max={128} value={customLength} onChange={(e) => setCustomLength(Math.max(8, Math.min(128, Number(e.target.value))))}/>} 
    </div>
    <div className="mt-3 flex items-center gap-2 rounded-ui border border-ink/10 p-3 font-mono text-sm break-all">
      <span className="min-w-0 flex-1">{value}</span><button onClick={copy} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-ui hover:bg-ink/5" aria-label="Copiar"><Copy size={17}/></button>
    </div>
  </div>
}
