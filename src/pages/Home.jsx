import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import Hero from '../components/home/Hero.jsx'
import { About, Portfolio, Testimonials, Contact } from '../components/home/Sections.jsx'
import BookingForm from '../components/BookingForm.jsx'

export default function Home() {
  const { hash, key } = useLocation()

  // Rola até a seção ao clicar em um item do menu.
  useEffect(() => {
    if (!hash) return
    const t = setTimeout(() => {
      document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' })
    }, 60)
    return () => clearTimeout(t)
  }, [hash, key])

  return (
    <>
      <Hero />
      <About />
      <Portfolio />
      <Testimonials />
      <section id="agendar" className="scroll-mt-16 bg-sand/60 px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-gold">Agendamento</p>
            <h2 className="section-title">Solicite seu orçamento</h2>
            <p className="mt-3 text-neutral-600">
              Preencha os dados do seu evento e retornaremos para combinar todos os detalhes.
            </p>
          </div>
          <BookingForm />
        </div>
      </section>
      <Contact />
    </>
  )
}
