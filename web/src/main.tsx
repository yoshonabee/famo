import App from './App'
import { MenuBarPanel } from './components/menu-bar-panel'
import { renderApp } from './render-app'

renderApp(
  new URLSearchParams(window.location.search).get('view') === 'menu-bar' ? (
    <MenuBarPanel />
  ) : (
    <App />
  ),
)
