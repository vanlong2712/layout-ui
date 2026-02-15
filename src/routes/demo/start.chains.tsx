import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useRef, useState, useEffect } from 'react'

export const Route = createFileRoute('/demo/start/chains')({
  component: RouteComponent,
})

function RouteComponent() {
  const [animatedMetrics, setAnimatedMetrics] = useState({}) // {chain: {laps: 0, progress: 0}}
  const animationRef = useRef()
  const lastTimeRef = useRef(0)
  const scale = 1000 // Adjust for visible speed (laps per second-ish)

  const { data: metrics, isSuccess } = useQuery({
    queryKey: ['metrics'],
    queryFn: async () => {
      const response = await fetch('/demo/api/chains')
      return response.json()
    },
    refetchInterval: 60000,
  })

  const animate = (time) => {
    const delta = time - lastTimeRef.current
    lastTimeRef.current = time
    setAnimatedMetrics((prev) => {
      const next = { ...prev }
      Object.keys(next).forEach((chain) => {
        const progInc = next[chain].speed * (delta / 1000)
        next[chain].progress += progInc
        while (next[chain].progress >= 1) {
          next[chain].laps += 1
          next[chain].progress -= 1
        }
      })
      return next
    })
    animationRef.current = requestAnimationFrame(animate)
  }

  useEffect(() => {
    lastTimeRef.current = performance.now()
    animationRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animationRef.current)
  }, [metrics]) // Restart on metric change

  useEffect(() => {
    if (isSuccess) {
      const initAnim = {}
      Object.keys(metrics).forEach((chain) => {
        initAnim[chain] = {
          laps: 0,
          progress: 0,
          speed: scale / metrics[chain].finality_ms,
        }
      })
      setAnimatedMetrics(initAnim)
    }
  }, [metrics, isSuccess])

  // Sort by laps descending
  const sortedChains = Object.keys(animatedMetrics).sort(
    (a, b) => animatedMetrics[b].laps - animatedMetrics[a].laps,
  )

  return (
    <div
      className="min-h-screen p-4 text-white grid grid-cols-1 gap-2"
      style={{
        backgroundColor: '#000',
        backgroundImage:
          'radial-gradient(ellipse 60% 60% at 0% 100%, #444 0%, #222 60%, #000 100%)',
      }}
    >
      {sortedChains.map((chain) => {
        const data = metrics[chain] || {}
        const anim = animatedMetrics[chain] || { laps: 0, progress: 0 }
        return (
          <div
            key={chain}
            className="border border-gray-700 rounded-lg p-4 items-center"
          >
            <div>
              <h2 className="text-xl font-bold">{chain.toUpperCase()}</h2>
              <p>
                {data.description} - {data.status}
              </p>
            </div>
            <div className="flex items-center">
              <div className="w-1/2">
                <p>Laps: {Math.floor(anim.laps)}</p>
                <div className="bg-gray-700 rounded-full h-4">
                  <div
                    className="bg-teal-500 h-4 rounded-full"
                    style={{ width: `${anim.progress * 100}%` }}
                  ></div>
                </div>
              </div>
              <p className="ml-4">Finality: {data.finality_ms}ms</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
