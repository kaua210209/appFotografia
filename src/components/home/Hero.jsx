import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSite } from '../../context/SiteContext.jsx'
import { publicUrl } from '../../lib/storage.js'

export default function Hero() {
  const { settings, carousel } = useSite()
  const [i, setI] = useState(0)
  const n = carousel.length
  const current = n ? i % n : 0
  const logo = settings.logo_path ? publicUrl(settings.logo_path) : null

  useEffect(() => {
    if (n < 2) return
    const t = setInterval(() => setI((v) => (v + 1) % n), 6000)
    return () => clearInterval(t)
  }, [n, i])

  return (
    <section id="inicio" className="relative h-[80vh] min-h-[500px] overflow-hidden bg-ink">
      {n === 0 && <div className="absolute inset-0 bg-gradient-to-br from-neutral-900 via-neutral-800 to-gold-dark/60" />}

      {carousel.map((img, idx) => (
        <img
          key={img.id}
          src={publicUrl(img.path)}
          alt=""
          loading={idx === 0 ? 'eager' : 'lazy'}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${
            idx === current ? 'opacity-100' : 'opacity-0'
          }`}
        />
      ))}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/40" />

      <div className="relative z-10 mx-auto flex h-full max-w-4xl flex-col items-center justify-center px-6 text-center text-white">
        {logo && <img src={logo} alt="" className="mb-6 h-20 w-auto object-contain sm:h-24" />}
        <h1 className="font-display text-4xl font-medium leading-tight sm:text-6xl">
          {settings.company_name || 'Estúdio de Fotografia'}
        </h1>
        {settings.tagline && <p className="mt-4 max-w-xl text-base text-white/85 sm:text-lg">{settings.tagline}</p>}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link to={{ pathname: '/', hash: '#agendar' }} className="btn btn-primary">
            Agendar sessão
          </Link>
          <Link to={{ pathname: '/', hash: '#portfolio' }} className="btn btn-light">
            Ver portfólio
          </Link>
        </div>
      </div>

      {n > 1 && (
        <>
          <button
            onClick={() => setI((current - 1 + n) % n)}
            className="absolute left-3 top-1/2 z-10 hidden -translate-y-1/2 cursor-pointer rounded-full bg-black/30 px-3 py-2 text-3xl text-white hover:bg-black/50 sm:block"
            aria-label="Foto anterior"
          >
            ‹
          </button>
          <button
            onClick={() => setI((current + 1) % n)}
            className="absolute right-3 top-1/2 z-10 hidden -translate-y-1/2 cursor-pointer rounded-full bg-black/30 px-3 py-2 text-3xl text-white hover:bg-black/50 sm:block"
            aria-label="Próxima foto"
          >
            ›
          </button>
          <div className="absolute bottom-5 left-0 right-0 z-10 flex justify-center gap-2">
            {carousel.map((img, idx) => (
              <button
                key={img.id}
                onClick={() => setI(idx)}
                aria-label={`Ir para a foto ${idx + 1}`}
                className={`h-2 cursor-pointer rounded-full transition-all ${
                  idx === current ? 'w-6 bg-gold' : 'w-2 bg-white/60'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  )
}
