import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { Upload, Image as ImageIcon, CheckCircle, Loader2, Tag, Filter, ShieldCheck, Tv, Check, X, Trash2, Lock, RotateCcw, Search, ArrowUpDown } from 'lucide-react'

const PRESET_TAGS = ['Service', 'Luncheon', 'Sangha', 'Ministers', 'History', 'Volunteers']

const EMOJI_MAP = [
  { type: 'heart', symbol: '❤️', label: 'Heart' },
  { type: 'gassho', symbol: '🙏', label: 'Gassho' },
  { type: 'applause', symbol: '👏', label: 'Applause' },
  { type: 'star', symbol: '🌟', label: 'Joy' },
  { type: 'smile', symbol: '😊', label: 'Smile' }
]

// Native Browser Canvas Image Resizer
const compressImageNative = (file, maxWidth = 1920, maxHeight = 1080, quality = 0.8) => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.src = URL.createObjectURL(file)
    img.onload = () => {
      let width = img.width
      let height = img.height

      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width)
          width = maxWidth
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height)
          height = maxHeight
        }
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error('Canvas compression failed'))
          }
        },
        'image/jpeg',
        quality
      )
    }
    img.onerror = (err) => reject(err)
  })
}

export default function App() {
  const [route, setRoute] = useState(window.location.hash || '#/')

  useEffect(() => {
    const handleHashChange = () => setRoute(window.location.hash || '#/')
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  if (route === '#/projector') return <ProjectorView />
  if (route === '#/admin') return <AdminView />

  return <PublicGuestView />
}

function PublicGuestView() {
  // Form state
  const [selectedFiles, setSelectedFiles] = useState([])
  const [uploaderName, setUploaderName] = useState('')
  const [selectedTags, setSelectedTags] = useState([])
  const [customTag, setCustomTag] = useState('')
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState('')
  const [success, setSuccess] = useState(false)

  // Feed, Filter, Search, and Sort State
  const [photos, setPhotos] = useState([])
  const [activeFilterTag, setActiveFilterTag] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState('NEWEST')
  const [loadingPhotos, setLoadingPhotos] = useState(true)
  const [brokenImageIds, setBrokenImageIds] = useState(new Set())

  useEffect(() => {
    fetchPhotos()

    const channel = supabase
      .channel('public-photos-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'photos' }, () => fetchPhotos())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, () => fetchPhotos())
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const fetchPhotos = async () => {
    setLoadingPhotos(true)
    try {
      let query = supabase
        .from('photos')
        .select(`
          *,
          photo_tags ( tag_id, tags(name) ),
          reactions ( emoji_type )
        `)
        .eq('is_approved', true)
        .order('created_at', { ascending: false })

      const { data: photosData, error } = await query
      if (error) throw error

      if (photosData) {
        setPhotos(photosData)
      }
    } catch (err) {
      console.error('Error fetching gallery:', err)
    } finally {
      setLoadingPhotos(false)
    }
  }

  // Calculate Popular Tags (>5 uses)
  const tagCounts = {}
  photos.forEach((photo) => {
    photo.photo_tags?.forEach((pt) => {
      const tagName = pt.tags?.name
      if (tagName) {
        tagCounts[tagName] = (tagCounts[tagName] || 0) + 1
      }
    })
  })

  const popularCustomTags = Object.keys(tagCounts).filter(
    (tName) => !PRESET_TAGS.includes(tName) && tagCounts[tName] >= 5
  )

  const allAvailableFilterTags = [...PRESET_TAGS, ...popularCustomTags]

  // Filter & Search Logic
  const getProcessedPhotos = () => {
    let list = photos.filter((p) => {
      if (brokenImageIds.has(p.id)) return false

      const matchesTag =
        activeFilterTag === 'ALL' ||
        p.photo_tags?.some((pt) => pt.tags?.name === activeFilterTag)

      const q = searchQuery.toLowerCase().trim()
      const matchesSearch =
        !q ||
        p.uploader_name?.toLowerCase().includes(q) ||
        p.photo_tags?.some((pt) => pt.tags?.name?.toLowerCase().includes(q))

      return matchesTag && matchesSearch
    })

    return list.sort((a, b) => {
      if (sortBy === 'NEWEST') {
        return new Date(b.created_at) - new Date(a.created_at)
      }
      if (sortBy === 'OLDEST') {
        return new Date(a.created_at) - new Date(b.created_at)
      }
      if (sortBy === 'MOST_LIKED') {
        const countA = a.reactions ? a.reactions.length : 0
        const countB = b.reactions ? b.reactions.length : 0
        if (countB !== countA) return countB - countA
        return new Date(b.created_at) - new Date(a.created_at)
      }
      return 0
    })
  }

  const processedPhotos = getProcessedPhotos()

  const toggleUploadTag = (tagName) => {
    if (selectedTags.includes(tagName)) {
      setSelectedTags(selectedTags.filter((t) => t !== tagName))
    } else {
      setSelectedTags([...selectedTags, tagName])
    }
  }

  const handleClearSelection = () => {
    setSelectedFiles([])
    setSuccess(false)
  }

  const handleUpload = async (e) => {
    e.preventDefault()
    if (selectedFiles.length === 0) return

    setUploading(true)
    setSuccess(false)

    try {
      let finalTags = [...selectedTags]
      if (customTag.trim() && !finalTags.includes(customTag.trim())) {
        finalTags.push(customTag.trim())
      }

      const tagIds = []
      for (const tName of finalTags) {
        const { data: existingTag } = await supabase
          .from('tags')
          .select('id')
          .eq('name', tName)
          .single()

        if (existingTag) {
          tagIds.push(existingTag.id)
        } else {
          const { data: newTag, error: tagErr } = await supabase
            .from('tags')
            .insert([{ name: tName }])
            .select('id')
            .single()

          if (tagErr) console.warn('Tag Insert Warning:', tagErr)
          if (newTag) tagIds.push(newTag.id)
        }
      }

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i]
        setProgress(`Optimizing and uploading photo ${i + 1} of ${selectedFiles.length}...`)

        const compressedBlob = await compressImageNative(file)
        const fileExt = file.name.split('.').pop() || 'jpg'
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`
        const filePath = `uploads/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from('raw-photos')
          .upload(filePath, compressedBlob, { contentType: 'image/jpeg' })

        if (uploadError) throw uploadError

        const { data: publicUrlData } = supabase.storage
          .from('raw-photos')
          .getPublicUrl(filePath)

        const { data: photoRecord, error: dbError } = await supabase
          .from('photos')
          .insert([
            {
              storage_path: filePath,
              thumbnail_path: publicUrlData.publicUrl,
              uploader_name: uploaderName.trim() || 'Sangha Member',
              is_approved: true
            }
          ])
          .select()
          .single()

        if (dbError) throw dbError

        if (tagIds.length > 0 && photoRecord) {
          const photoTagInserts = tagIds.map((tId) => ({
            photo_id: photoRecord.id,
            tag_id: tId
          }))
          await supabase.from('photo_tags').insert(photoTagInserts)
        }
      }

      setSuccess(true)
      setSelectedFiles([])
      setSelectedTags([])
      setCustomTag('')
      setProgress('')
      fetchPhotos()
    } catch (err) {
      console.error('Full Upload Error:', err)
      alert(`Upload error: ${err.message || 'Error processing image upload'}`)
    } finally {
      setUploading(false)
    }
  }

  const handleAddReaction = async (photoId, emojiType) => {
    try {
      await supabase.from('reactions').insert([{ photo_id: photoId, emoji_type: emojiType }])
      fetchPhotos()
    } catch (err) {
      console.error('Reaction Error:', err)
    }
  }

  return (
    <div className="min-h-screen bg-[#FDF7E7] text-gray-800 flex flex-col items-center justify-start p-4 sm:p-6">
      {/* Header Banner */}
      <header className="w-full max-w-2xl bg-[#0C6285] text-white p-6 rounded-2xl shadow-xl border-b-4 border-[#D4AF37] text-center mb-6 relative">
        <h1 className="text-2xl sm:text-3xl font-serif font-bold tracking-wide text-[#D4AF37]">
          Gardena Buddhist Church
        </h1>
        <p className="text-lg font-semibold mt-1 text-cyan-100">100th Anniversary Celebration</p>
        <p className="text-lg font-semibold text-cyan-100 mt-1">Visions of Nembutsu — Hands Together, Hearts Forward</p>

        <div className="mt-4 pt-3 border-t border-cyan-800/60 flex items-center justify-center gap-4 text-xs text-[#FDF7E7]">
          <a href="#/projector" target="_blank" rel="noreferrer" className="text-[#D4AF37] font-bold hover:underline flex items-center gap-1">
            <Tv className="w-3.5 h-3.5" /> Projector
          </a>
          <span>•</span>
          <a href="#/admin" className="text-cyan-200 hover:underline flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" /> Admin Portal
          </a>
        </div>
      </header>

      {/* Upload Form */}
      <main className="w-full max-w-2xl bg-white rounded-2xl shadow-lg border border-amber-200/60 p-6 sm:p-8 mb-10">
        <h2 className="text-xl font-bold text-[#0C6285] mb-2 flex items-center gap-2">
          <ImageIcon className="w-6 h-6 text-[#D4AF37]" /> Share Your Celebration Photos
        </h2>
        <p className="text-sm text-gray-600 mb-6">
          Upload photos from your camera roll and tag them so everyone can find and enjoy them!
        </p>

        <form onSubmit={handleUpload} className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-bold text-gray-700">Select Photos</label>
              {selectedFiles.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="text-xs text-red-600 hover:text-red-800 font-bold flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Clear Selection
                </button