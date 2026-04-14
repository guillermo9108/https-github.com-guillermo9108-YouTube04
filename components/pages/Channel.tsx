
import React, { useEffect, useState, useRef } from 'react';
import { useParams } from '../Router';
import { db } from '../../services/db';
import { User, Video } from '../../types';
import VideoCard from '../VideoCard';
import { useAuth } from '../../context/AuthContext';
import { User as UserIcon, Bell, Loader2, Check, Trash2, Upload, Play, Smartphone, Music, Image as ImageIcon, Layers, Plus } from 'lucide-react';
import { Link, useNavigate } from '../Router';
import ImageUploadModal from '../channel/ImageUploadModal';

export default function Channel() {
  const { userId } = useParams();
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();
  
  // Data State
  const [channelUser, setChannelUser] = useState<User | null>(null);
  const [allContent, setAllContent] = useState<Video[]>([]);
  const [filteredContent, setFilteredContent] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL');
  const [showImageUpload, setShowImageUpload] = useState(false);
  
  // Pagination State
  const [visibleCount, setVisibleCount] = useState(12);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  
  // User Interaction State
  const [stats, setStats] = useState({ views: 0, uploads: 0 });
  const [purchases, setPurchases] = useState<string[]>([]);
  const [isSubscribed, setIsSubscribed] = useState(false);

    // 1. Initial Data Load (Channel Info & All Content)
    useEffect(() => {
        if (!userId) {
            setLoading(false);
            return;
        }
        
        // Reset pagination when channel changes
        setVisibleCount(12);
        
        const loadChannel = async () => {
            setLoading(true);
            try {
                // 1. Get User Details
                const u = await db.getUser(userId);
                setChannelUser(u);

                // 2. Get ALL User Content once for snappy filtering
                const content = await db.getChannelContent(userId, 'ALL');
                setAllContent(content);

                // 3. Calc Stats
                const totalViews = content.reduce((acc: number, curr: Video) => acc + Number(curr.views), 0);
                setStats({ views: totalViews, uploads: content.length });

            } catch (e) {
                console.error("Failed to load channel", e);
            } finally {
                setLoading(false);
            }
        };

        loadChannel();
    }, [userId]);

    // 2. Snappy Frontend Filtering
    useEffect(() => {
        // Pre-calculate counts for all categories in this channel
        const categoryCounts: Record<string, number> = {};
        allContent.forEach(v => {
            if (v) {
                const cat = (v.category || '').toUpperCase();
                categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
            }
        });

        // Group by collection if it's an image album
        const grouped: Video[] = [];
        const collectionsSeen = new Set();
        
        allContent.forEach(item => {
            if (!item) return;
            const itemCat = (item.category || '').toUpperCase();
            if (item.collection && itemCat === 'IMAGES') {
                if (!collectionsSeen.has(item.collection)) {
                    collectionsSeen.add(item.collection);
                    // Find all items in this collection
                    const albumItems = allContent.filter(v => v.collection === item.collection);
                    // Create a virtual "Album" item
                    const albumItem = {
                        ...item,
                        isAlbum: true,
                        albumItems: albumItems,
                        categoryCount: categoryCounts[itemCat]
                    };
                    grouped.push(albumItem as any);
                }
            } else {
                grouped.push({
                    ...item,
                    categoryCount: categoryCounts[itemCat]
                });
            }
        });

        let filtered = grouped;
        if (filter === 'VIDEOS') {
            filtered = grouped.filter(v => {
                const isAudio = Number(v.is_audio) === 1;
                const path = (v as any).rawPath || v.videoUrl || '';
                const isImage = v.category === 'IMAGES' || path.match(/\.(jpg|jpeg|png|webp|gif|bmp|svg)(\?.*)?$/i);
                const duration = Number(v.duration || 0);
                return !isAudio && !isImage && duration >= 300;
            });
        } else if (filter === 'SHORTS') {
            filtered = grouped.filter(v => {
                const isAudio = Number(v.is_audio) === 1;
                const path = (v as any).rawPath || v.videoUrl || '';
                const isImage = v.category === 'IMAGES' || path.match(/\.(jpg|jpeg|png|webp|gif|bmp|svg)(\?.*)?$/i);
                const duration = Number(v.duration || 0);
                return !isAudio && !isImage && duration < 300;
            });
        } else if (filter === 'AUDIOS') {
            filtered = grouped.filter(v => Number(v.is_audio) === 1);
        } else if (filter === 'IMAGES') {
            filtered = grouped.filter(v => {
                const path = (v as any).rawPath || v.videoUrl || '';
                return v.category === 'IMAGES' || path.match(/\.(jpg|jpeg|png|webp|gif|bmp|svg)(\?.*)?$/i);
            });
        } else {
            filtered = grouped;
        }
        setFilteredContent(filtered);
        setVisibleCount(12); // Reset visible count on filter change
    }, [filter, allContent]);

  // 2. User Specific Checks (Subscription & Purchases)
  // Separated into its own effect to ensure it runs reliably when currentUser loads
  useEffect(() => {
      if (!currentUser || !userId) return;

      const checkUserStatus = async () => {
          try {
              // Check Subscription
              const subStatus = await db.checkSubscription(currentUser.id, userId);
              setIsSubscribed(subStatus);

              // Check Purchases (only if we have content loaded)
              if (allContent.length > 0) {
                  const checks = allContent.slice(0, 50).map((v: Video) => db.hasPurchased(currentUser.id, v.id));
                  const results = await Promise.all(checks);
                  const p = allContent.filter((_: Video, i: number) => results[i]).map((v: Video) => v.id);
                  setPurchases(p);
              }
          } catch (e) {
              console.error("Error checking user status", e);
          }
      };

      checkUserStatus();
  }, [currentUser, userId, allContent.length]); // Re-run if user logs in or content loads

  // 3. Infinite Scroll Logic (Same as Home)
  useEffect(() => {
      if (visibleCount >= filteredContent.length) return;

      const observer = new IntersectionObserver((entries) => {
          if (entries[0].isIntersecting) {
              setVisibleCount(prev => Math.min(prev + 12, filteredContent.length));
          }
      }, {
          threshold: 0.1,
          rootMargin: '1200px' // Pre-load when 1200px away from bottom
      });

      if (loadMoreRef.current) observer.observe(loadMoreRef.current);
      return () => observer.disconnect();
  }, [visibleCount, filteredContent.length]);

  const toggleSubscribe = async () => {
      if (!currentUser || !userId) return;
      
      const oldState = isSubscribed;
      setIsSubscribed(!oldState); // Optimistic UI
      
      try {
          const res = await db.toggleSubscribe(currentUser.id, userId);
          setIsSubscribed(res.isSubscribed);
      } catch (e) { 
          setIsSubscribed(oldState); // Revert on error
          console.error("Failed to subscribe", e);
      }
  };

  const handleDeleteVideo = async (videoId: string) => {
      if (!currentUser || !confirm("Permanently delete this item?")) return;
      try {
          await db.deleteVideo(videoId, currentUser.id);
          setAllContent(prev => prev.filter(v => v.id !== videoId));
          setStats(prev => ({...prev, uploads: prev.uploads - 1}));
      } catch(e: any) {
          alert("Delete failed: " + e.message);
      }
  };

  const isUnlocked = (videoId: string, creatorId: string) => {
    return purchases.includes(videoId) || (currentUser?.id === creatorId) || (currentUser?.role === 'ADMIN');
  };

  if (loading) return <div className="flex justify-center items-center h-[50vh]"><Loader2 className="animate-spin text-indigo-500" size={32}/></div>;
  if (!channelUser) return <div className="text-center p-10 text-slate-500">User not found</div>;

  return (
    <div className="pb-20 min-h-screen">
       {/* Background Blur Effect */}
       <div className="absolute top-0 left-0 right-0 h-64 overflow-hidden z-0 pointer-events-none opacity-40">
           {channelUser.avatarUrl && <img src={channelUser.avatarUrl} className="w-full h-full object-cover blur-3xl scale-110 brightness-50" referrerPolicy="no-referrer" />}
           <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black"></div>
       </div>

       {/* Channel Header Info */}
       <div className="relative z-10 px-1 pt-20 flex flex-col items-center mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
           {/* Avatar */}
           <div className="w-32 h-32 rounded-full border-4 border-black bg-slate-800 overflow-hidden shrink-0 shadow-2xl mb-4">
               {channelUser.avatarUrl ? (
                   <img src={channelUser.avatarUrl} alt={channelUser.username} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
               ) : (
                   <div className="w-full h-full flex items-center justify-center text-4xl text-slate-500">
                       <UserIcon size={48} />
                   </div>
               )}
           </div>

           {/* Info */}
           <div className="text-center">
               <h1 className="text-3xl font-bold text-white mb-2">{channelUser.username}</h1>
               <div className="text-slate-400 text-sm flex items-center justify-center gap-3 mb-6">
                   <span>@{channelUser.username}</span>
                   <span className="w-1 h-1 bg-slate-600 rounded-full"></span>
                   <span>{stats.uploads} contenidos</span>
                   <span className="w-1 h-1 bg-slate-600 rounded-full"></span>
                   <span>{stats.views} views</span>
               </div>
               
               {currentUser?.id !== channelUser.id && (
                   <button 
                       onClick={toggleSubscribe}
                       className={`px-8 py-3 rounded-full font-bold text-sm transition-all transform active:scale-95 flex items-center gap-2 mx-auto ${isSubscribed ? 'bg-slate-800 text-white hover:bg-slate-700' : 'bg-white text-black hover:bg-slate-200'}`}
                   >
                       {isSubscribed ? (
                           <><Check size={18}/> Subscribed</>
                       ) : (
                           <><Bell size={18}/> Subscribe</>
                       )}
                   </button>
               )}
           </div>
       </div>

        {/* Filters Section */}
        <div className="px-1 mb-8 relative z-10">
            <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
                {[
                    { id: 'ALL', label: 'Todo', icon: Layers },
                    { id: 'VIDEOS', label: 'Videos', icon: Play },
                    { id: 'SHORTS', label: 'Shorts', icon: Smartphone },
                    { id: 'AUDIOS', label: 'Audio', icon: Music },
                    { id: 'IMAGES', label: 'Imágenes', icon: ImageIcon }
                ].map((f) => (
                    <button
                        key={f.id}
                        onClick={() => setFilter(f.id)}
                        className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shrink-0 border ${
                            filter === f.id 
                            ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-600/20' 
                            : 'bg-slate-900 text-slate-400 border-white/5 hover:bg-slate-800'
                        }`}
                    >
                        <f.icon size={14} />
                        {f.label}
                    </button>
                ))}

                {/* Upload Button Integrated in Filters */}
                {currentUser?.id === userId && (
                    <button 
                        onClick={() => {
                            if (filter === 'IMAGES') {
                                setShowImageUpload(true);
                            } else {
                                navigate('/upload');
                            }
                        }}
                        className="flex items-center gap-2 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shrink-0 border bg-white text-black border-white hover:bg-slate-200 ml-auto"
                    >
                        <Plus size={14} />
                        {filter === 'IMAGES' ? 'Subir Imágenes' : 'Subir Contenido'}
                    </button>
                )}
            </div>
        </div>

        {/* Videos Grid */}
        <div className="relative z-10">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2 border-b border-slate-800 pb-2 px-1">Contenido</h2>
            {filteredContent.length === 0 ? (
                <div className="text-center py-20 text-slate-500">Este canal no tiene contenido disponible con este filtro.</div>
            ) : (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
                        {filteredContent.slice(0, visibleCount).map(video => (
                             <div key={video.id} className="relative group">
                                 <VideoCard 
                                     video={video} 
                                     isUnlocked={isUnlocked(video.id, video.creatorId)}
                                     isWatched={false} 
                                     onCategoryClick={() => navigate(`/#cat=${video.category}`)}
                                 />
                                 {(currentUser?.id === channelUser.id || currentUser?.role === 'ADMIN') && (
                                     <button 
                                         onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteVideo(video.id); }} 
                                         className="absolute top-2 left-2 bg-red-600/80 text-white p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                                         title="Delete Item"
                                     >
                                         <Trash2 size={16} />
                                     </button>
                                 )}
                             </div>
                        ))}
                    </div>
                    
                    {/* Infinite Scroll Sentinel */}
                    <div ref={loadMoreRef} className="h-20 flex items-center justify-center opacity-50">
                         {visibleCount < filteredContent.length && <Loader2 className="animate-spin text-slate-600"/>}
                    </div>
                </>
            )}
        </div>

        {showImageUpload && (
            <ImageUploadModal 
                onClose={() => setShowImageUpload(false)}
                onSuccess={() => {
                    // Refresh content
                    db.getChannelContent(userId!, 'ALL').then(setAllContent);
                }}
            />
        )}
    </div>
  );
}
