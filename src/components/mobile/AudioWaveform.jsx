/**
 * AudioWaveform — real-time audio-reactive bar visualization
 *
 * Taps into a WebRTC MediaStream via Web Audio API's AnalyserNode to
 * drive bar heights from actual frequency data. Used in MobileChatTab's
 * in-call state to make Q's speaking visualization react to real audio
 * instead of a fixed CSS animation loop.
 *
 * Performance: uses requestAnimationFrame + direct DOM manipulation
 * (no React state updates per frame). The bars are updated via refs.
 *
 * Props:
 *   stream: MediaStream | null — the remote audio stream from WebRTC
 *   active: boolean — whether to animate (false = idle bars)
 *   barCount: number — how many bars (default 7)
 *   color: string — bar color (default 'var(--success)')
 *   idleColor: string — bar color when not active (default 'var(--accent)')
 */
import { useEffect, useRef } from 'react'

export default function AudioWaveform({
  stream,
  active = false,
  barCount = 7,
  color = 'var(--success)',
  idleColor = 'var(--accent)',
}) {
  const barsRef = useRef([])
  const analyserRef = useRef(null)
  const ctxRef = useRef(null)
  const rafRef = useRef(null)
  const dataRef = useRef(null)

  // Set up the AnalyserNode when stream changes
  useEffect(() => {
    if (!stream) return

    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 64 // small = fast, 32 frequency bins
      analyser.smoothingTimeConstant = 0.7

      const source = audioCtx.createMediaStreamSource(stream)
      source.connect(analyser)
      // Don't connect to destination — we don't want to double-play the audio

      ctxRef.current = audioCtx
      analyserRef.current = analyser
      dataRef.current = new Uint8Array(analyser.frequencyBinCount)
    } catch {
      // Web Audio not supported or stream invalid — fall back to CSS animation
    }

    return () => {
      if (ctxRef.current?.state !== 'closed') {
        ctxRef.current?.close().catch(() => {})
      }
      analyserRef.current = null
      dataRef.current = null
    }
  }, [stream])

  // Animation loop — reads frequency data and sets bar heights directly
  useEffect(() => {
    if (!active || !analyserRef.current) {
      // Not active or no analyser — set bars to idle height
      barsRef.current.forEach(bar => {
        if (bar) bar.style.height = '4px'
      })
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      return
    }

    const tick = () => {
      const analyser = analyserRef.current
      const data = dataRef.current
      if (!analyser || !data) return

      analyser.getByteFrequencyData(data)

      // Pick evenly-spaced frequency bins for the bars
      const binCount = data.length
      for (let i = 0; i < barCount; i++) {
        const bar = barsRef.current[i]
        if (!bar) continue

        // Sample from the lower half of the spectrum (voice frequencies)
        const binIndex = Math.floor((i / barCount) * (binCount * 0.6))
        const value = data[binIndex] || 0
        // Map 0-255 → 4-28px height
        const height = 4 + (value / 255) * 24
        bar.style.height = `${height}px`
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [active, barCount])

  return (
    <div style={{ display: 'flex', gap: 3, alignItems: 'center', height: 24 }}>
      {Array.from({ length: barCount }, (_, i) => (
        <div
          key={i}
          ref={el => { barsRef.current[i] = el }}
          style={{
            width: 3,
            height: 4,
            borderRadius: 2,
            background: active ? color : idleColor,
            transition: active ? 'none' : 'height 0.3s ease, background 0.3s ease',
          }}
        />
      ))}
    </div>
  )
}
