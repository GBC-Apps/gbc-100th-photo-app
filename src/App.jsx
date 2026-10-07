import React, { useState, useEffect } from 'react'
import { supabase } from './supabaseClient'
import resizeImage from 'browser-image-resizer'
import { Upload, Image as ImageIcon, CheckCircle, Loader2, Tag, Filter, ShieldCheck, Tv, Check, X, Trash2, Lock } from 'lucide-react'
const PRESET_TAGS = ['Service', 'Luncheon', 'Sangha', 'Ministers', 'History', 'Volunteers']

const EMOJI_MAP = [
  { type: 'heart', symbol: '❤️', label: 'Heart' },
  { type: 'gassho', symbol: '🙏', label: 'Gassho' },
  { type: 'applause', symbol: '👏', label: 'Applause' },
  { type: 'star', symbol: '🌟', label: 'Joy' },
  { type: 'smile', symbol: '😊', label: 'Smile' }
]

const compressionConfig = {
  quality: 0.8,
  maxWidth: 1920,
  maxHeight: 1080,
  autoRotate: true
}

export default function App() {
  const [route, setRoute] = useState(window.location.hash || '#/')

  useEffect(() => {
    const handleHashChange = () => setRoute(window.location.hash || '#/')
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  if (route === '#/projector') {
    return <ProjectorView />
  }

  if (route === '#/admin') {
    return <AdminView />
  }

  return <PublicGuestView />
}

/* ==========================================================================
   1. PUBLIC GUEST VIEW (Upload & Live Feed)
   ========================================================================== */
function PublicGuestView() {
  const [selectedFiles, setSelectedFiles] = useState([])
  const [uploaderName, setUploaderName] = useState('')
  const [selectedTags, setSelectedTags] = useState([])
  const [customTag, setCustomTag] = useState('')
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState('')
  const [success, setSuccess] = useState(false)

  const [photos, setPhotos] = useState([])
  const [activeFilterTag, setActiveFilterTag] = useState('ALL')
  const [loadingPhotos, setLoadingPhotos] = useState(true)

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
  }, [activeFilterTag])

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
        let filtered = photosData
        if (activeFilterTag !== 'ALL') {
          filtered = photosData.filter(p =>
            p.photo_tags?.some(pt => pt.tags?.name === activeFilterTag)
          )
        }
        setPhotos(filtered)
      }
    } catch (err) {
      console.error('Error fetching gallery:', err)
    } finally {
      setLoadingPhotos(false)
    }
  }

  const toggleUploadTag = (tagName) => {
    if (selectedTags.includes(tagName)) {
      setSelectedTags(selectedTags.filter(t => t !== tagName))
    } else {
      setSelectedTags([...selectedTags, tagName])
    }
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
        const { data: existingTag } = await supabase.from('tags').select('id').eq('name', tName).single()
        if (existingTag) {
          tagIds.push(existingTag.id)
        } else {
          const { data: newTag } = await supabase.from('tags').insert([{ name: tName }]).select('id').single()
          if (newTag) tagIds.push(newTag.id)
        }
      }

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i]
        setProgress(`Compressing and uploading photo ${i + 1} of ${selectedFiles.length}...`)

        const resizedBlob = await resizeImage(file, compressionConfig)
        const fileExt = file.name.split('.').pop()
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`
        const filePath = `uploads/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from('raw-photos')
          .upload(filePath, resizedBlob)
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
          const photoTagInserts = tagIds.map(tId => ({
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
      console.error('Upload Error:', err)
      alert('An error occurred during upload. Please try again.')
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
      <header className="w-full max-w-2xl bg-[#0C6285] text-white p-6 rounded-2xl shadow-xl border-b-4 border-[#D4AF37] text-center mb-6 relative">
        <h1 className="text-2xl sm:text-3xl font-serif font-bold tracking-wide text-[#D4AF37]">
          Gardena Buddhist Church
        </h1>
        <p className="text-lg font-semibold mt-1 text-cyan-100">100th Anniversary Celebration</p>
        <div className="mt-3 pt-3 border-t border-cyan-800/60 flex items-center justify-between text-xs text-[#FDF7E7] px-2">
          <span>Visions of Nembutsu — Hands Together, Hearts Forward</span>
          <div className="flex gap-2">
            <a href="#/projector" target="_blank" rel="noreferrer" className="text-[#D4AF37] font-bold hover:underline flex items-center gap-1">
              <Tv className="w-3.5 h-3.5" /> Projector
            </a>
            <span>•</span>
            <a href="#/admin" className="text-cyan-200 hover:underline flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Admin
            </a>
          </div>
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
            <label className="block text-sm font-bold text-gray-700 mb-2">Select Photos</label>
            <div className="relative border-2 border-dashed border-[#0C6285]/40 hover:border-[#0C6285] rounded-xl p-6 text-center bg-[#FDF7E7]/50 transition-colors cursor-pointer">
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => { setSelectedFiles(Array.from(e.target.files)); setSuccess(false) }}
                disabled={uploading}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
              />
              <Upload className="w-10 h-10 text-[#0C6285] mx-auto mb-2" />
              <span className="text-base font-semibold text-[#0C6285] block">
                {selectedFiles.length > 0 ? `${selectedFiles.length} photo(s) selected` : 'Tap to select photos'}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-1">
              <Tag className="w-4 h-4 text-[#D4AF37]" /> Add Tags to Photo(s)
            </label>
            <div className="flex flex-wrap gap-2 mb-3">
              {PRESET_TAGS.map((tag) => {
                const isSelected = selectedTags.includes(tag)
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleUploadTag(tag)}
                    className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
                      isSelected
                        ? 'bg-[#0C6285] text-white shadow'
                        : 'bg-amber-100/60 text-[#0C6285] hover:bg-amber-200'
                    }`}
                  >
                    #{tag}
                  </button>
                )
              })}
            </div>

            <input
              type="text"
              value={customTag}
              onChange={(e) => setCustomTag(e.target.value)}
              placeholder="Add custom tag (e.g. #Hondo, #DharmaSchool)"
              className="w-full px-4 py-2.5 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#0C6285]"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Your Name / Family Name</label>
            <input
              type="text"
              value={uploaderName}
              onChange={(e) => setUploaderName(e.target.value)}
              placeholder="e.g. The Tanaka Family"
              className="w-full px-4 py-2.5 text-sm rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#0C6285]"
            />
          </div>

          {uploading && (
            <div className="bg-blue-50 border border-blue-200 text-[#0C6285] p-4 rounded-xl flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin shrink-0" />
              <span className="text-sm font-semibold">{progress}</span>
            </div>
          )}

          {success && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-xl flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-emerald-600 shrink-0" />
              <div>
                <p className="font-bold">Namu Amida Butsu! Thank you!</p>
                <p className="text-xs text-emerald-700">Your photos have been added to the Centennial collection.</p>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={uploading || selectedFiles.length === 0}
            className="w-full bg-[#0C6285] hover:bg-[#08425a] active:bg-[#052c3c] text-white font-bold text-lg py-4 rounded-xl shadow-md border-b-4 border-[#08425a] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[52px]"
          >
            {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
            Submit Photos
          </button>
        </form>
      </main>

      {/* Community Feed Section */}
      <section className="w-full max-w-2xl bg-white rounded-2xl shadow-lg border border-amber-200/60 p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b">
          <h2 className="text-xl font-bold text-[#0C6285] flex items-center gap-2">
            <Filter className="w-5 h-5 text-[#D4AF37]" /> Centennial Photo Feed
          </h2>

          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setActiveFilterTag('ALL')}
              className={`px-3 py-1.5 rounded-full text-xs font-bold ${
                activeFilterTag === 'ALL'
                  ? 'bg-[#0C6285] text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All Photos
            </button>
            {PRESET_TAGS.map((t) => (
              <button
                key={t}
                onClick={() => setActiveFilterTag(t)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold ${
                  activeFilterTag === t
                    ? 'bg-[#0C6285] text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                #{t}
              </button>
            ))}
          </div>
        </div>

        {loadingPhotos ? (
          <div className="text-center py-12 text-gray-500 flex flex-col items-center gap-2">
            <Loader2 className="w-8 h-8 animate-spin text-[#0C6285]" />
            <span>Loading Centennial photos...</span>
          </div>
        ) : photos.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            No photos found for this tag yet. Be the first to upload one!
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6">
            {photos.map((p) => {
              const reactions = p.reactions || []
              return (
                <div key={p.id} className="bg-[#FDF7E7]/40 rounded-xl border border-amber-200/70 overflow-hidden shadow-sm">
                  <img
                    src={p.thumbnail_path}
                    alt="Centennial Celebration"
                    className="w-full max-h-[450px] object-cover"
                    loading="lazy"
                  />
                  <div className="p-4">
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
                      <span className="font-semibold text-[#0C6285]">{p.uploader_name}</span>
                      <span>{new Date(p.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>

                    {p.photo_tags && p.photo_tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        {p.photo_tags.map((pt, idx) => (
                          <span key={idx} className="text-xs bg-amber-100 text-[#0C6285] px-2 py-0.5 rounded-md font-semibold">
                            #{pt.tags?.name}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-3 border-t border-amber-200/50">
                      <span className="text-xs font-semibold text-gray-500">Share Appreciation:</span>
                      <div className="flex gap-1.5">
                        {EMOJI_MAP.map((e) => {
                          const count = reactions.filter(r => r.emoji_type === e.type).length
                          return (
                            <button
                              key={e.type}
                              onClick={() => handleAddReaction(p.id, e.type)}
                              className="px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 hover:border-[#D4AF37] hover:bg-amber-50 text-sm flex items-center gap-1 shadow-xs transition-all active:scale-95"
                              title={e.label}
                            >
                              <span>{e.symbol}</span>
                              {count > 0 && <span className="text-xs font-bold text-[#0C6285]">{count}</span>}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <footer className="mt-8 text-center text-xs text-gray-500">
        Gardena Buddhist Church 100th Anniversary • October 18, 2026
      </footer>
    </div>
  )
}

/* ==========================================================================
   2. LIVE PROJECTOR SLIDESHOW VIEW (#/projector)
   ========================================================================== */
function ProjectorView() {
  const [slides, setSlides] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)

  useEffect(() => {
    fetchSlides()

    const channel = supabase
      .channel('projector-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'photos' }, () => fetchSlides())
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  // Auto-advance slide every 7 seconds
  useEffect(() => {
    if (slides.length <= 1) return
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % slides.length)
    }, 7000)
    return () => clearInterval(timer)
  }, [slides])

  const fetchSlides = async () => {
    const { data } = await supabase
      .from('photos')
      .select('*, photo_tags(tags(name))')
      .eq('is_approved', true)
      .order('created_at', { ascending: false })

    if (data && data.length > 0) {
      setSlides(data)
    }
  }

  if (slides.length === 0) {
    return (
      <div className="w-screen h-screen bg-black text-white flex flex-col items-center justify-center p-8 text-center">
        <h1 className="text-4xl font-serif text-[#D4AF37] mb-4">Gardena Buddhist Church 100th Anniversary</h1>
        <p className="text-xl text-gray-300">Waiting for photo uploads...</p>
      </div>
    )
  }

  const currentPhoto = slides[currentIndex]

  return (
    <div className="w-screen h-screen bg-black overflow-hidden relative flex flex-col justify-between">
      {/* Top Banner overlay */}
      <div className="absolute top-0 inset-x-0 bg-gradient-to-b from-black/80 to-transparent p-6 z-10 flex items-center justify-between text-white">
        <div>
          <h1 className="text-2xl font-serif font-bold text-[#D4AF37]">Gardena Buddhist Church</h1>
          <p className="text-sm font-semibold text-cyan-200">100th Anniversary Live Photo Wall</p>
        </div>
        <div className="bg-[#0C6285]/80 backdrop-blur-md px-4 py-2 rounded-xl border border-[#D4AF37]/50 text-sm font-bold">
          Scan QR Code or visit site to share your photos!
        </div>
      </div>

      {/* Main Image Slideshow */}
      <div className="w-full h-full flex items-center justify-center p-8 pt-20 pb-24">
        <img
          key={currentPhoto.id}
          src={currentPhoto.thumbnail_path}
          alt="Centennial Celebration"
          className="max-w-full max-h-full object-contain rounded-xl shadow-2xl transition-opacity duration-1000 ease-in-out"
        />
      </div>

      {/* Bottom Info Bar */}
      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-6 z-10 flex items-center justify-between text-white">
        <div>
          <p className="text-xs text-gray-400">Photo shared by</p>
          <p className="text-xl font-bold text-amber-100">{currentPhoto.uploader_name || 'Sangha Member'}</p>
        </div>

        {currentPhoto.photo_tags && currentPhoto.photo_tags.length > 0 && (
          <div className="flex gap-2">
            {currentPhoto.photo_tags.map((pt, idx) => (
              <span key={idx} className="bg-[#0C6285] border border-[#D4AF37] text-[#D4AF37] px-3 py-1 rounded-full text-sm font-bold">
                #{pt.tags?.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ==========================================================================
   3. ADMIN MODERATION PORTAL (#/admin)
   ========================================================================== */
function AdminView() {
  const [pin, setPin] = useState('')
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(false)

  // Demo passcode for temple staff moderation
  const ADMIN_PIN = '1926' // Centennial founding year passcode

  const handleLogin = (e) => {
    e.preventDefault()
    if (pin === ADMIN_PIN) {
      setIsAuthenticated(true)
      fetchAdminPhotos()
    } else {
      alert('Incorrect passcode. Please try again.')
    }
  }

  const fetchAdminPhotos = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('photos')
      .select('*, photo_tags(tags(name))')
      .order('created_at', { ascending: false })

    if (data) setPhotos(data)
    setLoading(false)
  }

  const toggleApproval = async (photoId, currentStatus) => {
    await supabase.from('photos').update({ is_approved: !currentStatus }).eq('id', photoId)
    fetchAdminPhotos()
  }

  const deletePhoto = async (photoId, storagePath) => {
    if (!confirm('Are you sure you want to permanently delete this photo?')) return

    await supabase.from('photos').delete().eq('id', photoId)
    if (storagePath) {
      await supabase.storage.from('raw-photos').remove([storagePath])
    }
    fetchAdminPhotos()
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#FDF7E7] flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="bg-white p-8 rounded-2xl shadow-xl border border-amber-200 w-full max-w-md text-center">
          <Lock className="w-12 h-12 text-[#0C6285] mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-[#0C6285] mb-2">Temple Staff Portal</h2>
          <p className="text-sm text-gray-600 mb-6">Enter moderation PIN to access photo controls</p>
          <input
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="Enter passcode"
            className="w-full text-center text-xl tracking-widest px-4 py-3 border border-gray-300 rounded-xl mb-4 focus:ring-2 focus:ring-[#0C6285] focus:outline-none"
          />
          <button
            type="submit"
            className="w-full bg-[#0C6285] hover:bg-[#08425a] text-white font-bold py-3 rounded-xl transition-colors"
          >
            Authenticate
          </button>
        </form>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FDF7E7] p-6">
      <header className="max-w-6xl mx-auto flex items-center justify-between bg-[#0C6285] text-white p-6 rounded-2xl mb-8 border-b-4 border-[#D4AF37]">
        <div>
          <h1 className="text-2xl font-bold text-[#D4AF37]">Moderation Control Panel</h1>
          <p className="text-sm text-cyan-100">Gardena Buddhist Church 100th Anniversary</p>
        </div>
        <a href="#/" className="bg-white/10 hover:bg-white/20 text-white text-sm px-4 py-2 rounded-xl transition-colors">
          Exit to Main App
        </a>
      </header>

      <main className="max-w-6xl mx-auto">
        {loading ? (
          <div className="text-center py-12">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-[#0C6285]" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {photos.map((p) => (
              <div key={p.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm flex flex-col justify-between">
                <div>
                  <img src={p.thumbnail_path} alt="Submission" className="w-full h-48 object-cover" />
                  <div className="p-4">
                    <p className="font-bold text-[#0C6285]">{p.uploader_name || 'Anonymous'}</p>
                    <p className="text-xs text-gray-400">{new Date(p.created_at).toLocaleString()}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <span className={`px-2 py-0.5 text-xs font-bold rounded-md ${p.is_approved ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                        {p.is_approved ? 'Approved' : 'Pending'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-4 border-t border-gray-100 flex gap-2">
                  <button
                    onClick={() => toggleApproval(p.id, p.is_approved)}
                    className={`flex-1 py-2 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-1 ${
                      p.is_approved ? 'bg-amber-100 text-amber-800 hover:bg-amber-200' : 'bg-emerald-600 text-white hover:bg-emerald-700'
                    }`}
                  >
                    {p.is_approved ? <X className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                    {p.is_approved ? 'Unapprove' : 'Approve'}
                  </button>
                  <button
                    onClick={() => deletePhoto(p.id, p.storage_path)}
                    className="p-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
                    title="Delete Photo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
