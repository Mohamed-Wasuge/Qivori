import { useApp } from '../context/AppContext'

export default function Toast() {
  const { toast } = useApp()
  return (
    <div className={'toast' + (toast.show ? ' show' : '')} id="toast">
      <div className="toast-icon">{toast.icon}</div>
      <div>
        <div className="toast-title">{toast.title}</div>
        <div className="toast-sub">{toast.sub}</div>
      </div>
    </div>
  )
}
