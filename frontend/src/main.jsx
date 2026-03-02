import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import './figma-landing.css'
import './figma-listing.css'
import './figma-booking.css'
import './figma-auth.css'
import './figma-services.css'
import './figma-provider-setup.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
)
