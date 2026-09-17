import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'text' | 'danger'
  icon?: ReactNode
}

export function Button({ variant = 'secondary', icon, className = '', children, ...props }: Props) {
  const variants = {
    primary: 'bg-action text-white border-action hover:bg-action/90',
    secondary: 'bg-surface text-ink border-ink/15 hover:border-ink/30 hover:bg-ink/[.035]',
    text: 'bg-transparent text-ink border-transparent hover:bg-ink/[.045]',
    danger: 'bg-ink text-canvas border-ink hover:bg-ink/90'
  }
  return <button className={`ui-button ${variants[variant]} ${className}`} {...props}>{icon}{children}</button>
}
