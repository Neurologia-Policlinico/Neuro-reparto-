import { useEffect } from 'react'

/** finestra che sale dal basso (sul telefono) o centrata (su schermi grandi) */
export default function Foglio({ titolo, chiudi, indietro, children }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && (indietro || chiudi)()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [chiudi, indietro])
  return (
    <div className="velo" onClick={chiudi}>
      <div className="foglio" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={titolo}>
        <div className="foglio-testa">
          {indietro && <button className="icona" onClick={indietro} aria-label="Indietro">‹</button>}
          <h2>{titolo}</h2>
          <button className="icona" onClick={chiudi} aria-label="Chiudi">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}
