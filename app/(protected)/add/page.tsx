import { WheresMyMoney } from '../components/wheres-my-money'
import { ReceiptDropzone } from '../components/receipt-dropzone'

export const metadata = {
  title: 'Add Transaction - Root OS',
}

export default function AddPage() {
  return (
    <main style={{ padding: '1.5rem', maxWidth: '800px', margin: '0 auto' }}>
      <WheresMyMoney />
      <ReceiptDropzone />
    </main>
  )
}
