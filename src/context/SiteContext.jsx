import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const SiteCtx = createContext(null)

export function SiteProvider({ children }) {
  const [state, setState] = useState({ settings: {}, services: [], carousel: [], loading: true })

  const refresh = useCallback(async () => {
    const [s, sv, c] = await Promise.all([
      supabase.from('site_settings').select('key,value'),
      supabase.from('services').select('*').order('sort_order'),
      supabase.from('carousel_images').select('*').order('sort_order'),
    ])
    setState({
      settings: Object.fromEntries((s.data || []).map((r) => [r.key, r.value])),
      services: sv.data || [],
      carousel: c.data || [],
      loading: false,
    })
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const value = useMemo(() => ({ ...state, refresh }), [state, refresh])
  return <SiteCtx.Provider value={value}>{children}</SiteCtx.Provider>
}

export function useSite() {
  return useContext(SiteCtx)
}
