'use client'

import { useState } from 'react'
import { WheresMyMoney } from '../components/wheres-my-money'
import { ReceiptDropzone } from '../components/receipt-dropzone'

type ActiveCard = 'receipt' | 'manual'

export default function AddPage() {
  const [active, setActive] = useState<ActiveCard>('receipt')

  return (
    <main style={{ padding: '1.5rem', maxWidth: '800px', margin: '0 auto' }}>
      <ReceiptDropzone
        collapsed={active !== 'receipt'}
        onToggle={() => setActive('receipt')}
      />
      <WheresMyMoney
        collapsed={active !== 'manual'}
        onToggle={() => setActive('manual')}
      />
    </main>
  )
}
