import { Provider } from 'react-redux'
import { store } from '@slices/store'
import { ToastContainer } from '@components/ui/AppToast'
import Routing from '@routes/index'

import '@assets/css/tailwind.css'

export default function App() {
  return (
    <Provider store={store}>
      <Routing />
      <ToastContainer />
    </Provider>
  )
}
