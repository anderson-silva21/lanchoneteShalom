import { createRoot } from 'react-dom/client'
import { SalesTerminal } from '../src/components/SalesTerminal'
import '../src/index.css'

createRoot(document.getElementById('root')).render(<SalesTerminal onSaleComplete={() => {}} />)
