import { useEffect, useRef, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'

interface MediaItem {
  type: 'image' | 'video'
  label: string
  hue: number
  prompt: string
  url: string
}

interface Particle {
  x: number
  y: number
  size: number
  speedX: number
  speedY: number
  hue: number
  life: number
  decay: number
}

function Home() {
  const [modalOpen, setModalOpen] = useState(false)
  const [galleryModalOpen, setGalleryModalOpen] = useState(false)
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null)

  const snakeCanvasRef = useRef<HTMLCanvasElement>(null)
  const artCanvasRef = useRef<HTMLCanvasElement>(null)
  const visualizerCanvasRef = useRef<HTMLCanvasElement>(null)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const audioSourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const visualizerAnimationRef = useRef<number | null>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [currentPreset, setCurrentPreset] = useState('cosmic')
  const [currentTime, setCurrentTime] = useState('0:00')
  const [totalTime, setTotalTime] = useState('0:00')
  const [progress, setProgress] = useState(0)

  // Snake Game State
  const [gameRunning, setGameRunning] = useState(false)
  const [score, setScore] = useState(0)
  const [gameOver, setGameOver] = useState(false)
  const snakeRef = useRef<{x: number, y: number}[]>([])
  const foodRef = useRef<{x: number, y: number}>({x: 0, y: 0})
  const directionRef = useRef<{x: number, y: number}>({x: 1, y: 0})
  const nextDirectionRef = useRef<{x: number, y: number}>({x: 1, y: 0})
  const gameLoopRef = useRef<number | null>(null)

  // Art Canvas State
  const particlesRef = useRef<Particle[]>([])
  const hueRef = useRef(200)
  const artAnimationRef = useRef<number | null>(null)

  const mediaConfig: MediaItem[] = [
    {
      type: 'image',
      label: 'Aurora',
      hue: 140,
      prompt: 'Aurora borealis over frozen lake, ethereal green lights dancing in night sky',
      url: 'https://image.cdn2.seaart.me/2025-12-01/d4mrdb5e878c73ek3pmg/e054f7c849af6d2077b38ab51cd42af5.webp'
    },
    {
      type: 'video',
      label: 'Nebula',
      hue: 280,
      prompt: 'Cosmic nebula with swirling purple gas clouds and golden star particles',
      url: 'https://image.cdn2.seaart.me/2025-12-01/d4mrdsle878c73ek3pt0_0/7d6b8c4d8d5f4b12cf9ac41e20decc8d.mp4'
    },
    {
      type: 'image',
      label: 'Golden',
      hue: 35,
      prompt: 'Golden hour sunlight streaming through autumn forest, magical atmosphere',
      url: 'https://image.cdn2.seaart.me/2025-12-01/d4mrdb5e878c73fuakq0/9cf40859fb1d11b94b6ab7b0bbe740c9.webp'
    },
    {
      type: 'video',
      label: 'Ocean',
      hue: 195,
      prompt: 'Underwater bioluminescent jellyfish, teal glow in deep sea',
      url: 'https://image.cdn2.seaart.me/2025-12-01/d4mrdsle878c73fuakvg_0/c010e1689a1ca19fb6d8a288674c22d1.mp4'
    },
    {
      type: 'image',
      label: 'Zen',
      hue: 340,
      prompt: 'Zen garden with cherry blossoms, pink petals on raked sand',
      url: 'https://image.cdn2.seaart.me/2025-12-01/d4mrdite878c73ek3pq0/92539323781ab29264a3c258ead6fdf5.webp'
    },
    {
      type: 'video',
      label: 'Neon',
      hue: 260,
      prompt: 'Futuristic neon cityscape at night, cyberpunk rain reflections',
      url: 'https://image.cdn2.seaart.me/2025-12-01/d4mrdsle878c73ek3ptg_0/4efdf38e775a3c0ba35b756433ae8ab2.mp4'
    }
  ]

  const presets = {
    cosmic: {
      title: 'Cosmic Drift',
      url: 'https://image.cdn2.seaart.me/2025-12-01/d4mremde878c73ek3qdg/dc40ee311c17b54a184c42d52b2625a6.mp3',
      color: '#0071e3'
    },
    rain: {
      title: 'Rain',
      url: 'https://image.cdn2.seaart.me/2025-12-01/d4mremde878c73fualeg/81e511e07b9380457b80e00723e460bf.mp3',
      color: '#5856d6'
    },
    pulse: {
      title: 'Pulse',
      url: 'https://image.cdn2.seaart.me/2025-12-01/d4mremde878c73ek3qe0/2bba6892ffc3e529f5667f1b80d7ce8b.mp3',
      color: '#ff9500'
    }
  }

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // ═══════════════════════════════════════════════════════════════
  // AUDIO VISUALIZER
  // ═══════════════════════════════════════════════════════════════
  const drawVisualizerRef = useRef<() => void>(() => {})

  useEffect(() => {
    const currentPresetConfig = presets[currentPreset as keyof typeof presets]
    drawVisualizerRef.current = () => {
      const canvas = visualizerCanvasRef.current
      const analyser = analyserRef.current
      if (!canvas || !analyser) return

      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const bufferLength = analyser.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)
      analyser.getByteFrequencyData(dataArray)

      ctx.fillStyle = 'rgba(10, 10, 10, 0.3)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const barWidth = canvas.width / bufferLength * 2.5
      let x = 0

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height * 0.8

        const gradient = ctx.createLinearGradient(0, canvas.height, 0, 0)
        gradient.addColorStop(0, 'transparent')
        gradient.addColorStop(1, currentPresetConfig.color)

        ctx.fillStyle = gradient
        ctx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight)
        x += barWidth
      }

      if (audioRef.current && !audioRef.current.paused) {
        visualizerAnimationRef.current = requestAnimationFrame(drawVisualizerRef.current)
      }
    }
    // presets is a static object that never changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPreset])

  const toggleMusic = async () => {
    if (!audioRef.current) return

    if (!audioCtxRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
      analyserRef.current = audioCtxRef.current.createAnalyser()
      analyserRef.current.fftSize = 256
    }

    if (audioCtxRef.current.state === 'suspended') {
      await audioCtxRef.current.resume()
    }

    if (!audioSourceRef.current && audioRef.current) {
      audioSourceRef.current = audioCtxRef.current.createMediaElementSource(audioRef.current)
      audioSourceRef.current.connect(analyserRef.current!)
      analyserRef.current!.connect(audioCtxRef.current.destination)
    }

    if (audioRef.current.paused) {
      audioRef.current.play()
      setIsPlaying(true)
      drawVisualizerRef.current()
    } else {
      audioRef.current.pause()
      setIsPlaying(false)
      if (visualizerAnimationRef.current) {
        cancelAnimationFrame(visualizerAnimationRef.current)
      }
    }
  }

  const changePreset = (preset: string) => {
    setCurrentPreset(preset)
    const wasPlaying = isPlaying

    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = presets[preset as keyof typeof presets].url
      audioRef.current.load()

      if (wasPlaying) {
        audioRef.current.play()
        setIsPlaying(true)
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // SNAKE GAME
  // ═══════════════════════════════════════════════════════════════
  const GRID = 16
  const CELL = 20

  const initGame = useCallback(() => {
    snakeRef.current = [
      { x: 8, y: 8 },
      { x: 7, y: 8 },
      { x: 6, y: 8 }
    ]
    directionRef.current = { x: 1, y: 0 }
    nextDirectionRef.current = { x: 1, y: 0 }
    setScore(0)
    setGameOver(false)

    // Place food
    do {
      foodRef.current = {
        x: Math.floor(Math.random() * GRID),
        y: Math.floor(Math.random() * GRID)
      }
    } while (snakeRef.current.some(s => s.x === foodRef.current.x && s.y === foodRef.current.y))
  }, [])

  const drawGame = useCallback(() => {
    const canvas = snakeCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.03)'
    ctx.lineWidth = 1
    for (let i = 0; i <= GRID; i++) {
      ctx.beginPath()
      ctx.moveTo(i * CELL, 0)
      ctx.lineTo(i * CELL, canvas.height)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, i * CELL)
      ctx.lineTo(canvas.width, i * CELL)
      ctx.stroke()
    }

    // Food (glowing)
    const food = foodRef.current
    const gradient = ctx.createRadialGradient(
      food.x * CELL + CELL/2, food.y * CELL + CELL/2, 0,
      food.x * CELL + CELL/2, food.y * CELL + CELL/2, CELL
    )
    gradient.addColorStop(0, '#ff3b30')
    gradient.addColorStop(0.5, 'rgba(255,59,48,0.5)')
    gradient.addColorStop(1, 'transparent')
    ctx.fillStyle = gradient
    ctx.fillRect(food.x * CELL - CELL/2, food.y * CELL - CELL/2, CELL * 2, CELL * 2)
    ctx.fillStyle = '#ff3b30'
    ctx.fillRect(food.x * CELL + 2, food.y * CELL + 2, CELL - 4, CELL - 4)

    // Snake
    snakeRef.current.forEach((seg, i) => {
      const alpha = 1 - (i / snakeRef.current.length) * 0.5
      ctx.fillStyle = i === 0 ? '#34c759' : `rgba(52, 199, 89, ${alpha})`
      ctx.fillRect(seg.x * CELL + 1, seg.y * CELL + 1, CELL - 2, CELL - 2)
    })
  }, [])

  const endGame = useCallback(() => {
    if (gameLoopRef.current) {
      clearInterval(gameLoopRef.current)
      gameLoopRef.current = null
    }
    setGameRunning(false)
    setGameOver(true)
  }, [])

  const updateGameRef = useRef<() => void>(() => {})

  useEffect(() => {
    updateGameRef.current = () => {
      directionRef.current = nextDirectionRef.current
      const head = {
        x: snakeRef.current[0].x + directionRef.current.x,
        y: snakeRef.current[0].y + directionRef.current.y
      }

      // Wall collision
      if (head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID) {
        endGame()
        return
      }

      // Self collision
      if (snakeRef.current.some(s => s.x === head.x && s.y === head.y)) {
        endGame()
        return
      }

      snakeRef.current.unshift(head)

      // Eat food
      if (head.x === foodRef.current.x && head.y === foodRef.current.y) {
        setScore(prev => prev + 10)
        do {
          foodRef.current = {
            x: Math.floor(Math.random() * GRID),
            y: Math.floor(Math.random() * GRID)
          }
        } while (snakeRef.current.some(s => s.x === foodRef.current.x && s.y === foodRef.current.y))
      } else {
        snakeRef.current.pop()
      }

      drawGame()
    }
  }, [drawGame, endGame])

  const startGame = useCallback(() => {
    if (gameLoopRef.current) {
      clearInterval(gameLoopRef.current)
    }
    initGame()
    setGameRunning(true)
    drawGame()
    gameLoopRef.current = window.setInterval(() => updateGameRef.current(), 120)
  }, [initGame, drawGame])

  // Keyboard controls for snake
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!gameRunning) return
      const key = e.key
      if ((key === 'ArrowUp' || key === 'w') && directionRef.current.y !== 1) {
        nextDirectionRef.current = { x: 0, y: -1 }
      } else if ((key === 'ArrowDown' || key === 's') && directionRef.current.y !== -1) {
        nextDirectionRef.current = { x: 0, y: 1 }
      } else if ((key === 'ArrowLeft' || key === 'a') && directionRef.current.x !== 1) {
        nextDirectionRef.current = { x: -1, y: 0 }
      } else if ((key === 'ArrowRight' || key === 'd') && directionRef.current.x !== -1) {
        nextDirectionRef.current = { x: 1, y: 0 }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [gameRunning])

  // ═══════════════════════════════════════════════════════════════
  // FLOW CANVAS - Generative Art
  // ═══════════════════════════════════════════════════════════════
  const initArtCanvas = useCallback(() => {
    const canvas = artCanvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }, [])

  const animateArtRef = useRef<() => void>(() => {})

  useEffect(() => {
    animateArtRef.current = () => {
      const canvas = artCanvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // Subtle fade
      ctx.fillStyle = 'rgba(10, 10, 10, 0.02)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      particlesRef.current = particlesRef.current.filter(p => {
        p.x += p.speedX
        p.y += p.speedY
        p.speedX *= 0.98
        p.speedY *= 0.98
        p.life -= p.decay
        p.size *= 0.99

        if (p.life > 0) {
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
          ctx.fillStyle = `hsla(${p.hue}, 80%, 60%, ${p.life})`
          ctx.fill()
          return true
        }
        return false
      })

      artAnimationRef.current = requestAnimationFrame(animateArtRef.current)
    }
  }, [])

  const addParticles = useCallback((x: number, y: number) => {
    for (let i = 0; i < 3; i++) {
      particlesRef.current.push({
        x,
        y,
        size: Math.random() * 8 + 2,
        speedX: Math.random() * 4 - 2,
        speedY: Math.random() * 4 - 2,
        hue: hueRef.current,
        life: 1,
        decay: Math.random() * 0.02 + 0.005
      })
    }
    hueRef.current = (hueRef.current + 1) % 360
  }, [])

  const handleArtMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = artCanvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    addParticles(x, y)
  }, [addParticles])

  const handleArtTouchMove = useCallback((e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = artCanvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const touch = e.touches[0]
    const x = touch.clientX - rect.left
    const y = touch.clientY - rect.top
    addParticles(x, y)
  }, [addParticles])

  const clearArt = useCallback(() => {
    particlesRef.current = []
    initArtCanvas()
  }, [initArtCanvas])

  const saveArt = useCallback(() => {
    const canvas = artCanvasRef.current
    if (!canvas) return
    const link = document.createElement('a')
    link.download = 'flow-art.png'
    link.href = canvas.toDataURL()
    link.click()
  }, [])

  // ═══════════════════════════════════════════════════════════════
  // Gallery
  // ═══════════════════════════════════════════════════════════════
  const openGalleryModal = (item: MediaItem) => {
    setSelectedMedia(item)
    setGalleryModalOpen(true)
  }

  const handleVideoHover = (e: React.MouseEvent<HTMLVideoElement>, play: boolean) => {
    const video = e.currentTarget
    if (play) {
      video.play()
    } else {
      video.pause()
      video.currentTime = 0
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Initialize
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    // Audio setup
    const cosmicUrl = 'https://image.cdn2.seaart.me/2025-12-01/d4mremde878c73ek3qdg/dc40ee311c17b54a184c42d52b2625a6.mp3'
    audioRef.current = new Audio(cosmicUrl)
    audioRef.current.loop = true
    audioRef.current.crossOrigin = 'anonymous'

    const audio = audioRef.current

    const handleTimeUpdate = () => {
      if (audio) {
        setProgress((audio.currentTime / audio.duration) * 100)
        setCurrentTime(formatTime(audio.currentTime))
      }
    }

    const handleLoadedMetadata = () => {
      if (audio) {
        setTotalTime(formatTime(audio.duration))
      }
    }

    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('loadedmetadata', handleLoadedMetadata)

    // Init snake game - set initial state directly
    snakeRef.current = [
      { x: 8, y: 8 },
      { x: 7, y: 8 },
      { x: 6, y: 8 }
    ]
    directionRef.current = { x: 1, y: 0 }
    nextDirectionRef.current = { x: 1, y: 0 }
    foodRef.current = {
      x: Math.floor(Math.random() * GRID),
      y: Math.floor(Math.random() * GRID)
    }
    drawGame()

    // Init art canvas
    initArtCanvas()

    // Start art animation
    const startArtAnimation = () => {
      artAnimationRef.current = requestAnimationFrame(() => {
        animateArtRef.current()
      })
    }
    startArtAnimation()

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.pause()
      if (gameLoopRef.current) clearInterval(gameLoopRef.current)
      if (artAnimationRef.current) cancelAnimationFrame(artAnimationRef.current)
      if (visualizerAnimationRef.current) cancelAnimationFrame(visualizerAnimationRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="overflow-x-hidden bg-(--bg-primary) text-(--text-primary)">
      {/* Hero Section */}
      <section className="min-h-screen flex flex-col justify-center items-center text-center p-8 relative overflow-hidden">
        {/* Background glow effect */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(800px,200vw)] h-[min(800px,200vw)] bg-[radial-gradient(circle,rgba(0,113,227,0.15)_0%,transparent_70%)] pointer-events-none" />

        <span className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full text-sm text-white/60 mb-8 backdrop-blur-lg relative animate-[fadeInUp_0.8s_ease-out]">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          Now Available
        </span>

        <h1 className="text-[clamp(3rem,12vw,7rem)] font-bold tracking-tight leading-none mb-6 bg-linear-to-br from-white to-white/70 bg-clip-text text-transparent animate-[fadeInUp_0.8s_ease-out]">
          Create Everything.
        </h1>

        <p className="text-[clamp(1.125rem,3vw,1.5rem)] text-white/60 max-w-[600px] mb-12 animate-[fadeInUp_0.8s_ease-out_0.1s_both]">
          AI-powered creative platform. Generate images, videos, music, and apps in seconds.
        </p>

        <div className="flex gap-4 flex-wrap justify-center animate-[fadeInUp_0.8s_ease-out_0.2s_both]">
          <a
            href="#gallery"
            className="inline-flex items-center gap-2 px-8 py-4 text-lg font-medium rounded-full bg-[#0071e3] text-white transition-all duration-300 hover:bg-[#0077ed] hover:scale-[1.02]"
          >
            See What's Possible
          </a>
        </div>
      </section>

      {/* AI Gallery */}
      <section className="pt-16 px-8 max-w-7xl mx-auto" id="gallery">
        <div className="mb-12">
          <div className="flex justify-between items-start flex-wrap gap-4 mb-8">
            <div className="flex flex-col gap-4">
              <span className="inline-block px-3.5 py-1.5 bg-[#0071e3]/15 text-[#0071e3] rounded-2xl text-xs font-semibold uppercase tracking-wider w-fit">
                AI Generated
              </span>
              <h3 className="text-3xl font-semibold tracking-tight">Created in Seconds</h3>
              <p className="text-white/60 text-lg leading-relaxed">
                Images by Google Gemini. Videos by Veo 3.0. All from text prompts.
              </p>
            </div>
            <div className="flex gap-6 items-center">
              <span className="flex items-center gap-2 text-sm text-white/60">
                <span className="w-2 h-2 bg-green-500 rounded-full" />
                Image
              </span>
              <span className="flex items-center gap-2 text-sm text-white/60">
                <span className="w-2 h-2 bg-orange-500 rounded-full" />
                Video
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {mediaConfig.map((item, index) => (
              <div
                key={index}
                className="aspect-16/10 bg-zinc-900 rounded-2xl cursor-pointer transition-all duration-400 relative overflow-hidden group hover:-translate-y-2 hover:shadow-[0_20px_40px_rgba(0,0,0,0.4)]"
                onClick={() => openGalleryModal(item)}
              >
                {item.type === "image" ? (
                  <img
                    src={item.url}
                    alt={item.label}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-400 group-hover:scale-105"
                  />
                ) : (
                  <video
                    src={item.url}
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    className="w-full h-full object-cover transition-transform duration-400 group-hover:scale-105"
                    onMouseEnter={(e) => handleVideoHover(e, true)}
                    onMouseLeave={(e) => handleVideoHover(e, false)}
                  />
                )}

                {/* Type indicator */}
                {item.type === "video" ? (
                  <div className="absolute top-4 right-4 w-8 h-8 bg-orange-500/90 rounded-full z-10 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <div className="border-l-10 border-l-white border-t-6 border-t-transparent border-b-6 border-b-transparent ml-1" />
                  </div>
                ) : (
                  <div className="absolute top-4 right-4 w-2.5 h-2.5 bg-green-500 rounded-full z-10 shadow-[0_0_0_3px_rgba(52,199,89,0.3)]" />
                )}

                {/* Overlay */}
                <div className="absolute bottom-0 left-0 right-0 p-5 pt-12 bg-linear-to-t from-black/80 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                  <span className="text-lg font-semibold text-white block">{item.label}</span>
                  <span className="text-xs text-white/60 uppercase tracking-wider mt-1">
                    {item.type === "video" ? "AI Video • Veo 3.0" : "AI Image • Gemini"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Interactive Demos */}
      <section className="py-32 px-8 max-w-7xl mx-auto" id="demos">
        <div className="text-center mb-20">
          <h2 className="text-[clamp(2rem,5vw,3.5rem)] font-semibold mb-4">Try It Yourself</h2>
          <p className="text-white/60 text-xl">Interactive demos. No signup required.</p>
        </div>

        {/* AI Music Player */}
        <div className="bg-white/5 border border-white/10 rounded-3xl p-6 sm:p-10 mb-12 grid grid-cols-1 lg:grid-cols-[280px_1fr_1fr] gap-8 items-center">
          <div className="aspect-square rounded-2xl overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.3)] group">
            <img
              src="https://image.cdn2.seaart.me/2025-12-01/d4mrjrte878c73ek3rf0/eddacc4f8e9899aaee0f531dab21550f.webp"
              alt="AI Music Visualization"
              className="w-full h-full object-cover transition-transform duration-400 group-hover:scale-105"
            />
          </div>

          <div className="flex flex-col gap-4">
            <span className="inline-block px-3.5 py-1.5 bg-[#0071e3]/15 text-[#0071e3] rounded-2xl text-xs font-semibold uppercase tracking-wider w-fit">
              AI Audio
            </span>
            <h3 className="text-3xl font-semibold tracking-tight">AI Music Player</h3>
            <p className="text-white/60 text-lg leading-relaxed">
              Real AI-generated music. Three different moods. Hit play.
            </p>
          </div>

          <div className="bg-[#0a0a0a] rounded-2xl p-6 flex flex-col gap-4">
            <div className="rounded-lg overflow-hidden">
              <canvas
                ref={visualizerCanvasRef}
                id="audioVisualizer"
                width="400"
                height="120"
                className="block w-full h-[120px] bg-linear-to-b from-[#0071e3]/10 to-transparent"
              />
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={toggleMusic}
                className="w-12 h-12 rounded-full bg-[#0071e3] border-none text-white flex items-center justify-center cursor-pointer transition-all duration-300 hover:bg-[#0077ed] hover:scale-105 shrink-0"
              >
                {!isPlaying ? (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                  </svg>
                )}
              </button>

              <div className="flex-1 flex flex-col gap-1 min-w-0">
                <span className="font-semibold truncate">
                  {presets[currentPreset as keyof typeof presets].title}
                </span>
                <span className="text-sm text-white/60">AI Generated • Mureka</span>
              </div>

              <div
                className={`flex items-end gap-[3px] h-6 ${isPlaying ? "[&>span]:animate-[wave_0.5s_ease-in-out_infinite_alternate]" : ""}`}
              >
                <span
                  className={`w-[3px] bg-[#0071e3] rounded-sm transition-all h-2 ${isPlaying ? "[animation-delay:0s]" : ""}`}
                />
                <span
                  className={`w-[3px] bg-[#0071e3] rounded-sm transition-all h-4 ${isPlaying ? "[animation-delay:0.1s]" : ""}`}
                />
                <span
                  className={`w-[3px] bg-[#0071e3] rounded-sm transition-all h-3 ${isPlaying ? "[animation-delay:0.2s]" : ""}`}
                />
                <span
                  className={`w-[3px] bg-[#0071e3] rounded-sm transition-all h-5 ${isPlaying ? "[animation-delay:0.3s]" : ""}`}
                />
                <span
                  className={`w-[3px] bg-[#0071e3] rounded-sm transition-all h-2.5 ${isPlaying ? "[animation-delay:0.4s]" : ""}`}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="w-full h-1 bg-white/10 rounded cursor-pointer overflow-hidden">
                <div
                  className="h-full bg-[#0071e3] rounded transition-[width] duration-100"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-white/60 tabular-nums">
                <span>{currentTime}</span>
                <span>{totalTime}</span>
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              {Object.keys(presets).map((preset) => (
                <button
                  key={preset}
                  className={`px-4 py-2 rounded-full text-sm cursor-pointer transition-all duration-300 ${
                    currentPreset === preset
                      ? "bg-[#0071e3] border-[#0071e3] text-white"
                      : "bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white"
                  }`}
                  onClick={() => changePreset(preset)}
                >
                  {presets[preset as keyof typeof presets].title}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Snake Game */}
        <div className="bg-white/5 border border-white/10 rounded-3xl p-6 sm:p-10 mb-12 grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div className="flex flex-col gap-4">
            <span className="inline-block px-3.5 py-1.5 bg-[#0071e3]/15 text-[#0071e3] rounded-2xl text-xs font-semibold uppercase tracking-wider w-fit">
              Game
            </span>
            <h3 className="text-3xl font-semibold tracking-tight">Pixel Snake</h3>
            <p className="text-white/60 text-lg leading-relaxed">
              Classic reimagined. Arrow keys or swipe to play.
            </p>
            <div className="flex items-center gap-6 mt-2">
              <button
                onClick={startGame}
                className="px-8 py-3 bg-[#0071e3] text-white border-none rounded-full font-medium cursor-pointer transition-all duration-300 hover:bg-[#0077ed] hover:scale-[1.02]"
              >
                {gameRunning ? "Restart" : gameOver ? "Play Again" : "Play"}
              </button>
              <span className="text-white/60 tabular-nums">
                Score: <span className="text-white font-semibold">{score}</span>
              </span>
            </div>
          </div>
          <div className="relative flex justify-center items-center">
            <canvas
              ref={snakeCanvasRef}
              id="snakeGame"
              width="320"
              height="320"
              className="bg-[#0a0a0a] rounded-2xl [image-rendering:pixelated] max-w-full"
            />
            {!gameRunning && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-2xl text-white/60 transition-opacity duration-300">
                <span>{gameOver ? `Game Over! Score: ${score}` : "Press Play to Start"}</span>
              </div>
            )}
          </div>
        </div>

        {/* Flow Canvas */}
        <div className="bg-white/5 border border-white/10 rounded-3xl p-6 sm:p-10 grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div className="flex flex-col gap-4">
            <span className="inline-block px-3.5 py-1.5 bg-[#0071e3]/15 text-[#0071e3] rounded-2xl text-xs font-semibold uppercase tracking-wider w-fit">
              Creative
            </span>
            <h3 className="text-3xl font-semibold tracking-tight">Flow Canvas</h3>
            <p className="text-white/60 text-lg leading-relaxed">
              Move your cursor to paint. Save your creation.
            </p>
            <div className="flex gap-3 mt-2">
              <button
                onClick={clearArt}
                className="px-5 py-2 bg-white/5 border border-white/10 rounded-full text-white/60 text-sm cursor-pointer transition-all duration-300 hover:bg-[#0071e3] hover:border-[#0071e3] hover:text-white"
              >
                Clear
              </button>
              <button
                onClick={saveArt}
                className="px-5 py-2 bg-white/5 border border-white/10 rounded-full text-white/60 text-sm cursor-pointer transition-all duration-300 hover:bg-[#0071e3] hover:border-[#0071e3] hover:text-white"
              >
                Save
              </button>
            </div>
          </div>
          <div className="relative flex justify-center items-center">
            <canvas
              ref={artCanvasRef}
              id="artCanvas"
              width="320"
              height="320"
              className="bg-[#0a0a0a] rounded-2xl cursor-crosshair max-w-full touch-none"
              onMouseMove={handleArtMouseMove}
              onTouchMove={handleArtTouchMove}
            />
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-32 px-8 max-w-7xl mx-auto" id="learn">
        <div className="text-center mb-20">
          <h2 className="text-[clamp(2rem,5vw,3.5rem)] font-semibold mb-4">Built Different</h2>
          <p className="text-white/60 text-xl">First principles thinking. Zero complexity.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-white/5 border border-white/10 rounded-3xl p-10 transition-all duration-300 hover:bg-white/8 hover:-translate-y-1 hover:border-white/20">
            <div className="w-14 h-14 flex items-center justify-center bg-linear-to-br from-[#0071e3] to-[#5856d6] rounded-2xl text-2xl mb-6">
              ⚡
            </div>
            <h3 className="text-xl font-semibold mb-3">Instant</h3>
            <p className="text-white/60 leading-relaxed">
              Describe it. Get it. No waiting, no configuration.
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-3xl p-10 transition-all duration-300 hover:bg-white/8 hover:-translate-y-1 hover:border-white/20">
            <div className="w-14 h-14 flex items-center justify-center bg-linear-to-br from-[#0071e3] to-[#5856d6] rounded-2xl text-2xl mb-6">
              🎯
            </div>
            <h3 className="text-xl font-semibold mb-3">Focused</h3>
            <p className="text-white/60 leading-relaxed">
              One goal: turn your ideas into reality. Nothing else.
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-3xl p-10 transition-all duration-300 hover:bg-white/8 hover:-translate-y-1 hover:border-white/20">
            <div className="w-14 h-14 flex items-center justify-center bg-linear-to-br from-[#0071e3] to-[#5856d6] rounded-2xl text-2xl mb-6">
              ∞
            </div>
            <h3 className="text-xl font-semibold mb-3">Limitless</h3>
            <p className="text-white/60 leading-relaxed">
              Images, videos, music, apps. If you can imagine it, build it.
            </p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32 px-8 text-center" id="start">
        <h2 className="text-[clamp(2rem,5vw,3rem)] font-semibold mb-6">
          Ready to build something amazing?
        </h2>
        <p className="text-white/60 text-xl mb-10">Join the creators who are shaping the future.</p>
        <Link
          to="/builder"
          className="inline-flex items-center gap-2 px-8 py-4 text-lg font-medium rounded-full bg-[#0071e3] text-white transition-all duration-300 hover:bg-[#0077ed] hover:scale-[1.02]"
        >
          Get Started — It's Free
        </Link>
      </section>

      {/* Footer */}
      <footer className="py-12 px-8 text-center border-t border-white/10">
        <p className="text-white/60 text-sm">SeaVerse. Built with obsession for craft.</p>
      </footer>

      {/* Gallery Modal */}
      {galleryModalOpen && (
        <div
          className={`fixed inset-0 bg-black/95 flex items-center justify-center z-2000 transition-all duration-300 ${galleryModalOpen ? "opacity-100 visible" : "opacity-0 invisible"}`}
          onClick={() => setGalleryModalOpen(false)}
        >
          <button
            className="absolute top-6 right-6 w-12 h-12 rounded-full bg-white/10 border-none text-white cursor-pointer flex items-center justify-center transition-all duration-300 hover:bg-white/20"
            onClick={() => setGalleryModalOpen(false)}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
          <div
            className="max-w-[90vw] max-h-[90vh] flex flex-col items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {selectedMedia && (
              <>
                {selectedMedia.type === "image" ? (
                  <img
                    src={selectedMedia.url}
                    alt={selectedMedia.label}
                    className="max-w-full max-h-[80vh] rounded-2xl"
                  />
                ) : (
                  <video
                    src={selectedMedia.url}
                    controls
                    autoPlay
                    loop
                    className="max-w-full max-h-[80vh] rounded-2xl"
                  />
                )}
                <h3 className="mt-6 text-2xl font-semibold">{selectedMedia.label}</h3>
                <p className="text-white/60 text-sm mt-2 text-center">
                  {selectedMedia.type === "video"
                    ? "AI Motion • Google Veo 3.0"
                    : "AI Image • Google Gemini"}
                </p>
              </>
            )}
          </div>
        </div>
      )}

      {/* Start Modal */}
      {modalOpen && (
        <div
          className={`fixed inset-0 bg-black/80 backdrop-blur-lg flex items-center justify-center z-1000 transition-all duration-300 ${modalOpen ? "opacity-100 visible" : "opacity-0 invisible"}`}
          onClick={() => setModalOpen(false)}
        >
          <div
            className={`bg-[#1a1a1a] border border-white/10 rounded-3xl p-12 max-w-[480px] w-[90%] text-center transition-transform duration-300 ${modalOpen ? "scale-100 translate-y-0" : "scale-90 translate-y-5"}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-[72px] h-[72px] bg-linear-to-br from-[#0071e3] to-[#5856d6] rounded-full flex items-center justify-center mx-auto mb-6 text-4xl">
              🚀
            </div>
            <h3 className="text-2xl font-semibold mb-3">Welcome to SeaVerse</h3>
            <p className="text-white/60 leading-relaxed mb-8">
              This is a demo template showcasing the platform's potential. Connect your backend to
              unlock the full creative experience.
            </p>
            <button
              className="inline-flex items-center gap-2 px-8 py-3.5 bg-[#0071e3] text-white border-none rounded-full font-medium cursor-pointer transition-all duration-300 hover:bg-[#0077ed] hover:scale-[1.02]"
              onClick={() => setModalOpen(false)}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Home
