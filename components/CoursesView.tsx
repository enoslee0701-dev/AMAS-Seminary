
import React, { useEffect, useState, useRef } from 'react';
import { TheologyCategory, Course, AcademicLevel } from '../types';
import { Search, Play, FileText, ArrowUpDown, Heart, BookOpen, RefreshCw, Plus, Upload, X, Check, Image as ImageIcon, Edit3, Save, GraduationCap, Layers, Scroll, ArrowLeft, ChevronRight, ChevronDown, Lock, Sparkles, Sprout, Briefcase } from 'lucide-react';
import { putImageDataURI, useImageUrl } from '../services/imageStore';
import { courseThumbnail } from '../services/imageFallback';
import { STOCK_PHOTOS } from '../services/stockPhotos';
import { canUploadCourses } from '../services/permissions';
import { useStickyState } from '../services/stickyState';

// Locally bundled photos (public/images/stock) — full fidelity, offline-safe.
const CATEGORY_FALLBACK: Record<string, string> = {
  [TheologyCategory.NT]:           STOCK_PHOTOS.bibleLight,
  [TheologyCategory.OT]:           STOCK_PHOTOS.mountain,
  [TheologyCategory.BIBLE_BASICS]: STOCK_PHOTOS.bibleOpen,
  [TheologyCategory.THEOLOGY]:     STOCK_PHOTOS.books,
  [TheologyCategory.PRACTICAL]:    STOCK_PHOTOS.practical,
  [TheologyCategory.HISTORY]:      STOCK_PHOTOS.libraryBooks,
  [TheologyCategory.LANGUAGE]:     STOCK_PHOTOS.missionGlobe,
};
const TRACK_BACHELOR = STOCK_PHOTOS.bibleLight;
const TRACK_MASTER = STOCK_PHOTOS.graduation;
const TRACK_DOCTOR = STOCK_PHOTOS.books;
const TRACK_POCKET = STOCK_PHOTOS.libraryBooks;
const CTA_BG = STOCK_PHOTOS.worship;

/**
 * Thumbnail tile with IndexedDB-aware image resolution.
 * Prefers `course.thumbnailImageId` (object URL from IDB), falls back to
 * `course.thumbnail` (legacy URL / network image / data URI).
 */
const ThumbnailTile: React.FC<{
  course: Course;
  fallbackUrl: string;
  tintCss: string;
  size: number;
}> = ({ course, fallbackUrl, size }) => {
  const idbUrl = useImageUrl(course.thumbnailImageId);
  const url = idbUrl ?? course.thumbnail ?? fallbackUrl;
  return (
    <div
      className="flex-shrink-0"
      style={{
        width: size, height: size,
        borderRadius: 12,
        // Photos render at natural color; a light bottom scrim adds depth
        // (the old category-tint multiply turned photos green/purple).
        background: `linear-gradient(180deg, rgba(4,20,45,0) 55%, rgba(4,20,45,0.30) 100%), url('${url}')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    />
  );
};

// Helper to compress images for LocalStorage
const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 600;
        const MAX_HEIGHT = 600;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        // Compress to JPEG at 60% quality
        resolve(canvas.toDataURL('image/jpeg', 0.6)); 
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};

interface CoursesViewProps {
  courses: Course[];
  onAddCourse: (course: Course) => void;
  onUpdateCourse: (course: Course) => void;
  favoriteCourseIds?: string[];
  onToggleFavorite?: (id: string) => void;
  onCourseClick?: (id: string) => void;
  onOpenPocketTheology?: () => void;
  /** Logged-in user's role; gates the upload/management UI. */
  userRole?: string;
  /** 打开「定制化神学」页面（课程页顶部引导卡）。 */
  onOpenCustomTheology?: () => void;
}

const CoursesView: React.FC<CoursesViewProps> = ({ courses, onAddCourse, onUpdateCourse, favoriteCourseIds = [], onToggleFavorite, onCourseClick, onOpenPocketTheology, userRole, onOpenCustomTheology }) => {
  // View Mode: 'selection' (landing) or 'list' (course list)
  const [viewMode, setViewMode] = useState<'selection' | 'list'>('selection');

  /* 这六项是「用户刚刚做过的选择」。打开一门课会把整个标签页子树卸载
     （App.tsx 用 selectedCourseId 三元切换），返回时重新挂载 ——
     用普通 useState 的话筛选、排序、搜索词会全部被清空。
     实测：筛「新约书卷」→ 进课 → 返回，选中色跳回「全部」。
     useStickyState 只在本次运行期间记住，冷启动仍回默认值。 */
  const [activeCategory, setActiveCategory] = useStickyState<string>('courses.activeCategory', '全部');
  const [activeLevel, setActiveLevel] = useStickyState<string>('courses.activeLevel', '全部');
  const [searchQuery, setSearchQuery] = useStickyState<string>('courses.searchQuery', '');
  const [searchExpanded, setSearchExpanded] = useStickyState<boolean>('courses.searchExpanded', false);
  const [myCoursesOnly, setMyCoursesOnly] = useStickyState<boolean>('courses.myCoursesOnly', false);
  const [sortBy, setSortBy] = useStickyState<string>('courses.sortBy', 'default');


  // Enrollment Modal State
  const [enrollPrompt, setEnrollPrompt] = useState<Course | null>(null);

  // --- Add Course State ---
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCourseForm, setNewCourseForm] = useState({
    title: '',
    instructor: '',
    category: TheologyCategory.NT,
    // Fixed: AcademicLevel property updated from BACHELOR to BTH
    level: AcademicLevel.BTH, // Default level
    description: '',
    thumbnail: '',
    thumbnailPreview: '', // Store Base64 string
    syllabusFile: null as File | null
  });
  
  // --- Edit Course State ---
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [editForm, setEditForm] = useState({
    title: '',
    instructor: '',
    category: TheologyCategory.NT,
    // Fixed: AcademicLevel property updated from BACHELOR to BTH
    level: AcademicLevel.BTH, // Default level
    thumbnail: '',
    thumbnailPreview: '' // Store Base64 string
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const editImageInputRef = useRef<HTMLInputElement>(null);

  // Permission Check: Only admin, dean, or teacher can upload/edit
  const canUpload = canUploadCourses(userRole);

  // 官方目录 7 大类（services/catalog.ts）
  const categories = [
    '全部',
    TheologyCategory.NT,
    TheologyCategory.OT,
    TheologyCategory.BIBLE_BASICS,
    TheologyCategory.THEOLOGY,
    TheologyCategory.PRACTICAL,
    TheologyCategory.HISTORY,
    TheologyCategory.LANGUAGE,
  ];

  // Programs Configuration for Landing Page
  const programs = [
    { 
      id: '全部', 
      label: '全部课程', 
      sub: 'All Courses',
      desc: '浏览所有神学资源',
      icon: Layers, 
      color: 'bg-slate-800', 
      text: 'text-slate-100',
      border: 'border-slate-700',
      iconColor: 'text-slate-300',
      gradient: 'from-slate-700 to-slate-900'
    },
    { 
      // Fixed: AcademicLevel property updated from BACHELOR to BTH
      id: AcademicLevel.BTH, 
      label: '学士课程', 
      sub: 'Bachelor Program',
      desc: '建立神学根基',
      icon: BookOpen, 
      color: 'bg-emerald-600', 
      text: 'text-emerald-50',
      border: 'border-emerald-500',
      iconColor: 'text-emerald-200',
      gradient: 'from-emerald-500 to-emerald-700'
    },
    { 
      // Fixed: AcademicLevel property updated from MASTER to MDIV
      id: AcademicLevel.MDIV, 
      label: '硕士课程', 
      sub: 'Master Program',
      desc: '深造牧养能力',
      icon: GraduationCap, 
      color: 'bg-blue-600', 
      text: 'text-blue-50',
      border: 'border-blue-500',
      iconColor: 'text-blue-200',
      gradient: 'from-blue-500 to-blue-700'
    },
    { 
      // Fixed: AcademicLevel property updated from DOCTOR to DMIN
      id: AcademicLevel.DMIN, 
      label: '博士课程', 
      sub: 'Doctoral Program',
      desc: '贡献学术研究',
      icon: Scroll, 
      color: 'bg-purple-600', 
      text: 'text-purple-50',
      border: 'border-purple-500',
      iconColor: 'text-purple-200',
      gradient: 'from-purple-500 to-purple-700'
    }
  ];

  // Helper to determine badge style based on level
  const getLevelBadgeStyle = (level: AcademicLevel) => {
    switch (level) {
      // Fixed: Updated AcademicLevel keys to BTH, MDIV, DMIN
      case AcademicLevel.BTH:
        return "bg-emerald-400/90 text-emerald-950 border-emerald-500/30";
      case AcademicLevel.MDIV:
        return "bg-blue-400/90 text-blue-950 border-blue-500/30";
      case AcademicLevel.DMIN:
        return "bg-purple-400/90 text-purple-950 border-purple-500/30";
      default:
        return "bg-slate-400/90 text-slate-900 border-slate-500/30";
    }
  };

  // Filter and Sort Logic
  const displayedCourses = courses.filter(course => {
    const matchCategory = activeCategory === '全部' || course.category === activeCategory;
    const matchLevel = activeLevel === '全部' || course.level === activeLevel;
    const searchLower = searchQuery.toLowerCase();
    const matchSearch = course.title.toLowerCase().includes(searchLower) || 
                        course.instructor.toLowerCase().includes(searchLower);
    return matchCategory && matchLevel && matchSearch;
  }).sort((a, b) => {
    switch (sortBy) {
      case 'title':
        return a.title.localeCompare(b.title, 'zh-CN');
      case 'instructor':
        return a.instructor.localeCompare(b.instructor, 'zh-CN');
      case 'progress_asc':
        return a.progress - b.progress;
      case 'progress_desc':
        return b.progress - a.progress;
      default:
        return 0;
    }
  });

  // --- Handlers ---
  const handleProgramSelect = (levelId: string) => {
      setActiveLevel(levelId);
      setViewMode('list');
      setSearchQuery(''); // Clear search on entry
      // Scroll to top of window, though in some layouts main container scroll is needed
      window.scrollTo(0, 0);
  };

  const handleBackToSelection = () => {
      setViewMode('selection');
  };

  // --- Add Handlers ---
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourseForm.title || !newCourseForm.instructor) {
        alert("请填写课程名称和讲师");
        return;
    }

    // If the user picked a thumbnail image, put it in IndexedDB so we don't
    // bloat localStorage with base64. Falls back to the inline data URI if
    // IDB isn't available.
    let thumbnailImageId: string | undefined;
    let thumbnail = courseThumbnail(newCourseForm.title || 'new-course', TheologyCategory.NT);
    if (newCourseForm.thumbnailPreview) {
      if (newCourseForm.thumbnailPreview.startsWith('data:image/')) {
        const id = await putImageDataURI(newCourseForm.thumbnailPreview);
        if (id) { thumbnailImageId = id; thumbnail = ''; }
        else thumbnail = newCourseForm.thumbnailPreview;
      } else {
        thumbnail = newCourseForm.thumbnailPreview;
      }
    }
    const newCourse: Course = {
        id: `new-${Date.now()}`,
        title: newCourseForm.title,
        instructor: newCourseForm.instructor,
        category: TheologyCategory.NT,
        // Fixed: AcademicLevel property updated from BACHELOR to BTH
        level: AcademicLevel.BTH,
        thumbnail,
        thumbnailImageId,
        progress: 0,
        totalLessons: 12,
        completedLessons: 0
    };

    onAddCourse(newCourse);
    setShowAddModal(false);
    // Reset form
    setNewCourseForm({
        title: '',
        instructor: '',
        category: TheologyCategory.NT,
        // Fixed: AcademicLevel property updated from BACHELOR to BTH
        level: AcademicLevel.BTH,
        description: '',
        thumbnail: '',
        thumbnailPreview: '',
        syllabusFile: null
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          setNewCourseForm({ ...newCourseForm, syllabusFile: e.target.files[0] });
      }
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          try {
            const compressed = await compressImage(file);
            setNewCourseForm({ ...newCourseForm, thumbnailPreview: compressed });
          } catch (err) {
            console.error("Compression failed", err);
            const reader = new FileReader();
            reader.onloadend = () => {
                setNewCourseForm({ ...newCourseForm, thumbnailPreview: reader.result as string });
            };
            reader.readAsDataURL(file);
          }
      }
  };

  // --- Edit Handlers ---
  const handleEditClick = (course: Course) => {
    setEditingCourse(course);
    setEditForm({
      title: course.title,
      instructor: course.instructor,
      category: course.category,
      // Fixed: AcademicLevel property updated from BACHELOR to BTH
      level: course.level || AcademicLevel.BTH,
      thumbnail: course.thumbnail,
      thumbnailPreview: ''
    });
  };

  const handleEditImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          try {
            const compressed = await compressImage(file);
            setEditForm({ ...editForm, thumbnailPreview: compressed });
          } catch (err) {
             console.error("Compression failed", err);
             const reader = new FileReader();
             reader.onloadend = () => {
                 setEditForm({ ...editForm, thumbnailPreview: reader.result as string });
             };
             reader.readAsDataURL(file);
          }
      }
  };

  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCourse) return;

    // Same IDB-or-fallback flow as add.
    let thumbnailImageId = editingCourse.thumbnailImageId;
    let thumbnail = editForm.thumbnail;
    if (editForm.thumbnailPreview) {
      if (editForm.thumbnailPreview.startsWith('data:image/')) {
        const id = await putImageDataURI(editForm.thumbnailPreview);
        if (id) { thumbnailImageId = id; thumbnail = ''; }
        else thumbnail = editForm.thumbnailPreview;
      } else {
        thumbnail = editForm.thumbnailPreview;
      }
    }
    onUpdateCourse({
      ...editingCourse,
      title: editForm.title,
      instructor: editForm.instructor,
      category: editForm.category,
      level: editForm.level,
      thumbnailImageId,
      thumbnail
    });
    setEditingCourse(null);
  };


  const handleEnrollConfirm = () => {
    if (!enrollPrompt) return;
    onUpdateCourse({ ...enrollPrompt, progress: Math.max(enrollPrompt.progress, 1) });
    setEnrollPrompt(null);
  };

  return (
    <div className="pb-24 min-h-screen bg-slate-50 relative">

      {/* Enroll Confirmation Modal */}
      {enrollPrompt && (
        <div className="fixed inset-0 z-[80] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in max-w-md mx-auto" onClick={() => setEnrollPrompt(null)}>
          <div className="bg-white w-full rounded-3xl p-6 shadow-2xl text-center animate-scale-in" onClick={(e) => e.stopPropagation()}>
            <div className="w-16 h-16 bg-blue-50 text-[#04285F] rounded-full flex items-center justify-center mx-auto mb-4">
              <GraduationCap size={28} />
            </div>
            <h3 className="text-[17px] font-bold text-slate-900 mb-1">申请加入课程</h3>
            <p className="text-[13px] text-slate-500 font-semibold mb-1">{enrollPrompt.title}</p>
            <p className="text-[11px] text-slate-400 mb-5">{enrollPrompt.instructor} · {enrollPrompt.category}</p>
            <div className="flex" style={{ gap: 8 }}>
              <button onClick={() => setEnrollPrompt(null)} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-[13px]">取消</button>
              <button onClick={handleEnrollConfirm} className="flex-1 py-3 bg-[#04285F] text-white rounded-xl font-bold text-[13px]">确认申请</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Course Modal */}
      {showAddModal && canUpload && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl relative animate-scale-in max-h-[90vh] overflow-y-auto">
                <button onClick={() => setShowAddModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
                    <X size={20} />
                </button>
                <div className="flex items-center mb-6">
                    <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mr-3">
                        <Upload size={20} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900">上传新课程</h3>
                </div>

                <form onSubmit={handleAddSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1.5">课程名称 <span className="text-red-500">*</span></label>
                        <input 
                            type="text" 
                            value={newCourseForm.title}
                            onChange={(e) => setNewCourseForm({...newCourseForm, title: e.target.value})}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-900"
                            placeholder="例如：摩西五经导论"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1.5">讲师姓名 <span className="text-red-500">*</span></label>
                        <input 
                            type="text" 
                            value={newCourseForm.instructor}
                            onChange={(e) => setNewCourseForm({...newCourseForm, instructor: e.target.value})}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-900"
                            placeholder="例如：张牧师"
                        />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1.5">所属分类</label>
                            <select 
                                value={newCourseForm.category}
                                onChange={(e) => setNewCourseForm({...newCourseForm, category: e.target.value as TheologyCategory})}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-900 appearance-none"
                            >
                                {Object.values(TheologyCategory).map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1.5">学位等级</label>
                            <select 
                                value={newCourseForm.level}
                                onChange={(e) => setNewCourseForm({...newCourseForm, level: e.target.value as AcademicLevel})}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-900 appearance-none"
                            >
                                {Object.values(AcademicLevel).map(lvl => (
                                    <option key={lvl} value={lvl}>{lvl}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Image Upload Section */}
                    <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1.5">课程封面图片</label>
                        <div 
                            onClick={() => imageInputRef.current?.click()}
                            className="w-full h-32 bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center text-slate-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition-all cursor-pointer overflow-hidden relative group"
                        >
                            {newCourseForm.thumbnailPreview ? (
                                <>
                                    <img src={newCourseForm.thumbnailPreview} alt="Preview" className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <div className="bg-white/20 backdrop-blur p-2 rounded-full text-white">
                                            <RefreshCw size={20} />
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <ImageIcon size={24} className="mb-2"/>
                                    <span className="text-[10px]">点击上传封面图片</span>
                                </>
                            )}
                        </div>
                        <input type="file" accept="image/*" ref={imageInputRef} className="hidden" onChange={handleImageChange} />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1.5">课程简介</label>
                        <textarea 
                            rows={3}
                            value={newCourseForm.description}
                            onChange={(e) => setNewCourseForm({...newCourseForm, description: e.target.value})}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-900 resize-none"
                            placeholder="简要介绍课程内容..."
                        />
                    </div>
                    
                    <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1.5">课程大纲/讲义 (PDF)</label>
                        <div 
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full h-16 bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center text-slate-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition-all cursor-pointer"
                        >
                            {newCourseForm.syllabusFile ? (
                                <div className="flex items-center text-blue-600">
                                    <FileText size={18} className="mr-2"/>
                                    <span className="text-xs font-bold truncate max-w-[200px]">{newCourseForm.syllabusFile.name}</span>
                                </div>
                            ) : (
                                <>
                                    <Upload size={18} className="mb-1"/>
                                    <span className="text-[10px]">点击上传 PDF 文件</span>
                                </>
                            )}
                        </div>
                        <input type="file" accept=".pdf" ref={fileInputRef} className="hidden" onChange={handleFileChange} />
                    </div>

                    <button 
                        type="submit"
                        className="w-full bg-blue-900 text-white font-bold py-3.5 rounded-xl shadow-lg mt-2 active:scale-95 transition-transform flex items-center justify-center"
                    >
                        <Check size={18} className="mr-2" strokeWidth={3} />
                        发布课程
                    </button>
                </form>
            </div>
        </div>
      )}

      {/* Edit Course Modal */}
      {editingCourse && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-2xl relative animate-scale-in">
                <button onClick={() => setEditingCourse(null)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
                    <X size={20} />
                </button>
                <div className="flex items-center mb-6">
                    <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mr-3">
                        <Edit3 size={20} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900">编辑课程信息</h3>
                </div>

                <form onSubmit={handleUpdateSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1.5">课程名称</label>
                        <input 
                            type="text" 
                            value={editForm.title}
                            onChange={(e) => setEditForm({...editForm, title: e.target.value})}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-900"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1.5">讲师姓名</label>
                        <input 
                            type="text" 
                            value={editForm.instructor}
                            onChange={(e) => setEditForm({...editForm, instructor: e.target.value})}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-900"
                        />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1.5">所属分类</label>
                            <select 
                                value={editForm.category}
                                onChange={(e) => setEditForm({...editForm, category: e.target.value as TheologyCategory})}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-900 appearance-none"
                            >
                                {Object.values(TheologyCategory).map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-600 mb-1.5">学位等级</label>
                            <select 
                                value={editForm.level}
                                onChange={(e) => setEditForm({...editForm, level: e.target.value as AcademicLevel})}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-900 appearance-none"
                            >
                                {Object.values(AcademicLevel).map(lvl => (
                                    <option key={lvl} value={lvl}>{lvl}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-600 mb-1.5">课程封面图片</label>
                        <div 
                            onClick={() => editImageInputRef.current?.click()}
                            className="w-full h-32 bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center text-slate-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition-all cursor-pointer overflow-hidden relative group"
                        >
                            {editForm.thumbnailPreview || editForm.thumbnail ? (
                                <>
                                    <img src={editForm.thumbnailPreview || editForm.thumbnail} alt="Preview" className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <div className="bg-white/20 backdrop-blur p-2 rounded-full text-white">
                                            <RefreshCw size={20} />
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <ImageIcon size={24} className="mb-2"/>
                                    <span className="text-[10px]">点击上传封面图片</span>
                                </>
                            )}
                        </div>
                        <input type="file" accept="image/*" ref={editImageInputRef} className="hidden" onChange={handleEditImageChange} />
                    </div>

                    <button 
                        type="submit"
                        className="w-full bg-blue-900 text-white font-bold py-3.5 rounded-xl shadow-lg mt-2 active:scale-95 transition-transform flex items-center justify-center"
                    >
                        <Save size={18} className="mr-2" strokeWidth={2} />
                        保存修改
                    </button>
                </form>
            </div>
        </div>
      )}

      {/* === REDESIGNED UI: 学习中心 === */}
      {(() => {
        const programBucket = (lvl?: AcademicLevel): '学士' | '硕士' | '博士' | '证书' => {
          if (!lvl) return '证书';
          if (lvl === AcademicLevel.BTH) return '学士';
          if (lvl === AcademicLevel.MDIV || lvl === AcademicLevel.MPTH) return '硕士';
          return '博士';
        };

        type StatusKind = 'free' | 'apply' | 'locked' | 'unlocked';
        const statusOf = (c: Course): { kind: StatusKind; tagText: string; btnText: string } => {
          if (c.progress > 0) return { kind: 'unlocked', tagText: '已解锁', btnText: '继续学习' };
          if (!c.level || c.level === AcademicLevel.BTH) return { kind: 'free', tagText: '可试听', btnText: '免费试听' };
          if (c.level === AcademicLevel.MDIV || c.level === AcademicLevel.MPTH) return { kind: 'apply', tagText: '需报名', btnText: '申请学习' };
          return { kind: 'locked', tagText: '学员专属', btnText: '查看课程' };
        };
        const statusTone: Record<StatusKind, { tagBg: string; tagText: string; btnBorder: string; btnText: string }> = {
          free:     { tagBg: '#D5F5E3', tagText: '#137A4F', btnBorder: '#3BB17A', btnText: '#137A4F' },
          apply:    { tagBg: '#FCE7C8', tagText: '#9A5B11', btnBorder: '#E89B3F', btnText: '#9A5B11' },
          locked:   { tagBg: '#DDEAFB', tagText: '#23508F', btnBorder: '#4F86C8', btnText: '#23508F' },
          unlocked: { tagBg: '#E8DAF7', tagText: '#5A2EA0', btnBorder: '#8A55D9', btnText: '#5A2EA0' },
        };

        const thumbFor = (c: Course) => c.thumbnail || CATEGORY_FALLBACK[c.category] || CATEGORY_FALLBACK[TheologyCategory.NT];
        const tintFor = (c: Course): string => {
          switch (c.category) {
            case TheologyCategory.NT:    return 'linear-gradient(135deg,#1B3A6B 0%,#23508F 100%)';
            case TheologyCategory.THEOLOGY:  return 'linear-gradient(135deg,#0F5132 0%,#137A4F 100%)';
            case TheologyCategory.HISTORY:  return 'linear-gradient(135deg,#7A4A0F 0%,#9A6B1D 100%)';
            case TheologyCategory.PRACTICAL:   return 'linear-gradient(135deg,#3F1E70 0%,#5A2EA0 100%)';
            case TheologyCategory.THEOLOGY: return 'linear-gradient(135deg,#7A1E4A 0%,#A02E5A 100%)';
            default: return 'linear-gradient(135deg,#04285F 0%,#0A3878 100%)';
          }
        };

        const mainCategories = [TheologyCategory.NT, TheologyCategory.OT, TheologyCategory.BIBLE_BASICS, TheologyCategory.THEOLOGY, TheologyCategory.PRACTICAL, TheologyCategory.HISTORY, TheologyCategory.LANGUAGE];
        const matchesCategory = (c: Course) => {
          if (activeCategory === '全部') return true;
          if (activeCategory === '其他') return !mainCategories.includes(c.category);
          return c.category === activeCategory;
        };
        const visibleCourses = courses.filter(c =>
          (activeLevel === '全部' || programBucket(c.level) === activeLevel)
          && matchesCategory(c)
          && (!myCoursesOnly || c.progress > 0)
          && (!searchQuery
              || c.title.toLowerCase().includes(searchQuery.toLowerCase())
              || c.instructor.toLowerCase().includes(searchQuery.toLowerCase()))
        );

        const inProgress = courses.find(c => c.progress > 0) || null;

        const academicTracks = [
          {
            value: '学士', label: '学士课程', sub: 'B.Th.',
            desc: '建立神学根基', audience: '适合初学者',
            icon: BookOpen,
            titleColor: '#1F4530', subColor: '#3D6648', descColor: '#2A5238',
            baseColor: '#DCEFCB',
            baseColorTransparent: 'rgba(220,239,203,0)',
            image: TRACK_BACHELOR,
          },
          {
            value: '硕士', label: '硕士课程', sub: 'M.Div. | M.Pth.',
            desc: '装备牧养能力', audience: '适合牧者',
            icon: GraduationCap,
            titleColor: '#1B3A6B', subColor: '#3E5F8C', descColor: '#23498A',
            baseColor: '#D4E3F4',
            baseColorTransparent: 'rgba(212,227,244,0)',
            image: TRACK_MASTER,
          },
          {
            value: '博士', label: '博士课程', sub: 'D.Min. | Ph.D.',
            desc: '深化学术研究', audience: '适合研究者',
            icon: Scroll,
            titleColor: '#3F1E70', subColor: '#664798', descColor: '#4A2A86',
            baseColor: '#E0D4F0',
            baseColorTransparent: 'rgba(224,212,240,0)',
            image: TRACK_DOCTOR,
          },
          {
            value: 'pocket', label: '口袋神学', sub: 'Pocket Theology',
            desc: '每日 5 分钟神学闯关', audience: '适合所有人',
            icon: Sparkles,
            titleColor: '#7A4A0F', subColor: '#9A6B1D', descColor: '#7A4A0F',
            baseColor: '#F8DEB8',
            baseColorTransparent: 'rgba(248,222,184,0)',
            image: TRACK_POCKET,
            route: 'pocket' as const,
          },
        ];
        const trackCounts: Record<string, number> = {
          '学士': courses.filter(c => programBucket(c.level) === '学士').length,
          '硕士': courses.filter(c => programBucket(c.level) === '硕士').length,
          '博士': courses.filter(c => programBucket(c.level) === '博士').length,
          '证书': courses.filter(c => programBucket(c.level) === '证书').length,
        };

        return (
          <div
            className="animate-fade-in"
            style={{
              paddingTop:
                activeLevel === '全部'
                  ? 'calc(var(--safe-top) + 56px)'
                  : 'var(--safe-top)',
            }}
          >
            {/* 1. HEADER (FIXED — only shown on the main hub) */}
            {activeLevel === '全部' && (
            <header
              className="fixed top-0 left-0 right-0 max-w-md mx-auto z-50 bg-slate-50/95 backdrop-blur-md px-5 flex items-center justify-between border-b border-slate-100/60"
              style={{
                paddingTop: 'var(--safe-top)',
                height: 'calc(var(--safe-top) + 56px)',
              }}
            >
              {searchExpanded ? (
                <div className="flex items-center w-full" style={{ gap: 10 }}>
                  <div className="flex items-center flex-1 bg-white border border-slate-200 rounded-full pl-3 pr-2" style={{ height: 38 }}>
                    <Search size={15} className="text-slate-400 mr-2 shrink-0" />
                    <input
                      autoFocus
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="搜索课程或讲师"
                      className="flex-1 min-w-0 bg-transparent outline-none text-[14px] text-slate-800 placeholder:text-slate-400"
                    />
                    {searchQuery && (
                      <button
                        aria-label="清空"
                        onClick={() => setSearchQuery('')}
                        className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center shrink-0 active:scale-95 transition"
                      >
                        <X size={12} className="text-slate-500" />
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => { setSearchQuery(''); setSearchExpanded(false); }}
                    className="shrink-0 text-[14px] font-semibold text-[#04285F] active:opacity-60 transition"
                  >
                    取消
                  </button>
                </div>
              ) : (<>
              <div className="flex items-center" style={{ gap: 8 }}>
                <div className="w-8 h-8 rounded-lg bg-[#04285F] flex items-center justify-center">
                  <GraduationCap size={16} color="#E8C98C" strokeWidth={2.4} />
                </div>
                <h1 className="text-[20px] font-extrabold text-slate-900 tracking-tight">学习中心</h1>
              </div>
              <div className="flex items-center" style={{ gap: 8 }}>
                <button
                  aria-label="搜索"
                  onClick={() => setSearchExpanded(true)}
                  /* 36×36 → 热区 46×46。伪元素向右只扩 6px，与右邻的「我的学习」
                     之间有 8px gap，两块热区碰不到。 */
                  className="relative w-9 h-9 rounded-full bg-white border border-slate-200 flex items-center justify-center active:scale-95 transition before:absolute before:-inset-[6px] before:content-['']"
                >
                  <Search size={16} className="text-slate-500" />
                </button>
                <button
                  onClick={() => setMyCoursesOnly(v => !v)}
                  /* 36 高 → 46。只向上下扩，不动左右，免得和左边的搜索圈抢。 */
                  className="relative flex items-center rounded-full active:scale-95 transition before:absolute before:-inset-y-[5px] before:inset-x-0 before:content-['']"
                  style={{
                    height: 36, paddingLeft: 12, paddingRight: 14, gap: 5,
                    background: myCoursesOnly ? '#E8C98C' : '#04285F',
                    color: myCoursesOnly ? '#04285F' : '#FFFFFF',
                  }}
                >
                  <BookOpen size={14} strokeWidth={2.2} />
                  <span className="text-[12px] font-semibold">{myCoursesOnly ? '全部课程' : '我的学习'}</span>
                </button>
              </div>
              </>)}
            </header>
            )}

            {activeLevel === '全部' && !searchQuery.trim() && (<>
            {/* 2. HERO PATH CARD */}
            <section className="px-4">
              <div
                className="relative overflow-hidden"
                style={{
                  borderRadius: 18,
                  background: 'linear-gradient(135deg,#04285F 0%,#0A3878 60%,#0F4690 100%)',
                  minHeight: 168,
                }}
              >
                <div
                  className="absolute inset-y-0 right-0 pointer-events-none"
                  style={{
                    width: '60%',
                    backgroundImage: `url('${CTA_BG}')`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center right',
                    opacity: 0.85,
                  }}
                />
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background:
                      'linear-gradient(90deg,#04285F 0%,rgba(4,40,95,0.92) 35%,rgba(4,40,95,0.35) 65%,rgba(4,40,95,0.05) 100%)',
                  }}
                />
                <div className="relative z-10 px-5 pt-5 pb-5">
                  <h2 className="text-white font-extrabold tracking-tight" style={{ fontSize: 20, lineHeight: '26px' }}>
                    定制化神学
                  </h2>
                  <p className="text-white/75 mt-2" style={{ fontSize: 12, lineHeight: '18px', maxWidth: '60%' }}>
                    认识你的信仰基础、成长状态与 12 项事奉倾向，为你生成专属装备路径。
                  </p>
                  <button
                    onClick={() => onOpenCustomTheology?.()}
                    className="mt-4 inline-flex items-center bg-[#E8C98C] text-[#04285F] rounded-full font-bold active:scale-95 transition"
                    /* 本页的主行动点，实测只有 32 高。这里直接长到 44：
                       外层卡片 minHeight 168，长高后内容约 162，撑不破。 */
                    style={{ minHeight: 44, paddingLeft: 14, paddingRight: 12, fontSize: 12, gap: 4 }}
                  >
                    进入定制化神学
                    <ChevronRight size={14} strokeWidth={2.6} />
                  </button>
                </div>
              </div>
            </section>

            {/* 5. ACADEMIC TRACKS — 学士 / 硕士 / 博士 / 信徒装备 */}
            <section id="academic-tracks" className="px-4 mt-4 scroll-mt-24">
              <div className="flex items-end justify-between mb-2.5">
                <div>
                  <h3 className="text-[15px] font-bold text-slate-900">学位轨道</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">按培养层级选择适合你的课程</p>
                </div>
                {activeLevel !== '全部' && (
                  <button
                    onClick={() => setActiveLevel('全部')}
                    className="text-[11px] text-[#04285F] flex items-center font-semibold"
                  >
                    全部 <X size={12} className="ml-0.5" />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2" style={{ gap: 12 }}>
                {academicTracks.map((tr) => {
                  const Icon = tr.icon;
                  const active = activeLevel === tr.value;
                  const isPocket = (tr as any).route === 'pocket';
                  return (
                    <button
                      key={tr.value}
                      onClick={() => isPocket ? onOpenPocketTheology?.() : setActiveLevel(active ? '全部' : tr.value)}
                      className="relative overflow-hidden text-left active:scale-[0.98] transition"
                      style={{
                        background: tr.baseColor,
                        borderRadius: 18,
                        minHeight: 152,
                        boxShadow: active
                          ? '0 10px 24px rgba(16,24,40,0.18), 0 0 0 2px #E8C98C inset'
                          : '0 4px 14px rgba(16,24,40,0.08)',
                      }}
                    >
                      {/* RIGHT-SIDE IMAGE (faded into base color on its left edge) */}
                      <div
                        aria-hidden
                        style={{
                          position: 'absolute',
                          top: 0, right: 0, bottom: 0,
                          width: '58%',
                          backgroundImage: `url('${tr.image}')`,
                          backgroundSize: 'cover',
                          backgroundPosition: 'center right',
                          opacity: 0.95,
                          WebkitMaskImage: `linear-gradient(90deg, transparent 0%, black 55%, black 100%)`,
                          maskImage: `linear-gradient(90deg, transparent 0%, black 55%, black 100%)`,
                        }}
                      />
                      {/* SOLID-COLOR LEFT WASH for text legibility */}
                      <div
                        aria-hidden
                        style={{
                          position: 'absolute', inset: 0,
                          background: `linear-gradient(90deg, ${tr.baseColor} 0%, ${tr.baseColor} 42%, ${tr.baseColorTransparent} 70%)`,
                          pointerEvents: 'none',
                        }}
                      />

                      {/* CONTENT */}
                      <div className="relative" style={{ padding: 14, zIndex: 1 }}>
                        {/* TOP ROW: solid icon + solid count chip */}
                        <div className="flex items-start justify-between">
                          <div
                            className="flex items-center justify-center"
                            style={{
                              width: 32, height: 32, borderRadius: '50%',
                              background: tr.titleColor,
                              boxShadow: '0 2px 6px rgba(16,24,40,0.18)',
                            }}
                          >
                            <Icon size={16} color="#FFFFFF" strokeWidth={2.4} />
                          </div>
                          <span
                            className="font-bold"
                            style={{
                              fontSize: 10,
                              padding: '3px 8px',
                              borderRadius: 999,
                              background: '#FFFFFF',
                              color: tr.titleColor,
                              boxShadow: '0 2px 6px rgba(16,24,40,0.10)',
                            }}
                          >
                            {isPocket ? '每日更新' : `${trackCounts[tr.value]} 门`}
                          </span>
                        </div>

                        {/* TITLE BLOCK (left-aligned, away from image) */}
                        <div className="mt-3" style={{ maxWidth: '62%' }}>
                          <div
                            className="font-black tracking-tight"
                            style={{ fontSize: 17, lineHeight: '20px', color: tr.titleColor }}
                          >
                            {tr.label}
                          </div>
                          <div
                            className="font-semibold tracking-wider"
                            style={{ fontSize: 10, color: tr.subColor, marginTop: 4 }}
                          >
                            {tr.sub}
                          </div>
                          <div
                            className="font-medium"
                            style={{ fontSize: 11, color: tr.descColor, marginTop: 8 }}
                          >
                            {tr.desc}
                          </div>
                        </div>

                        {/* BOTTOM ROW: solid audience pill + solid arrow circle */}
                        <div className="flex items-center justify-between" style={{ marginTop: 10 }}>
                          <span
                            className="font-semibold"
                            style={{
                              fontSize: 9.5,
                              padding: '3px 8px',
                              borderRadius: 999,
                              background: '#FFFFFF',
                              color: tr.titleColor,
                              boxShadow: '0 2px 6px rgba(16,24,40,0.10)',
                            }}
                          >
                            {tr.audience}
                          </span>
                          <div
                            className="flex items-center justify-center"
                            style={{
                              width: 24, height: 24, borderRadius: '50%',
                              background: '#FFFFFF',
                              boxShadow: '0 2px 6px rgba(16,24,40,0.12)',
                            }}
                          >
                            <ChevronRight size={14} color={tr.titleColor} strokeWidth={2.4} />
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* 3. MY PROGRESS */}
            {inProgress && (
              <section className="px-4 mt-4">
                <div className="flex items-end justify-between mb-2.5">
                  <h3 className="text-[15px] font-bold text-slate-900">我的学习进度</h3>
                  <button
                    className="text-[11px] text-[#04285F] font-semibold flex items-center"
                    onClick={() => onCourseClick?.(inProgress.id)}
                  >
                    继续学习 <ChevronRight size={12} strokeWidth={2.4} />
                  </button>
                </div>
                <div
                  onClick={() => onCourseClick?.(inProgress.id)}
                  className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 flex active:scale-[0.99] transition cursor-pointer"
                  style={{ gap: 12 }}
                >
                  <ThumbnailTile course={inProgress} fallbackUrl={thumbFor(inProgress)} tintCss={tintFor(inProgress)} size={80} />
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <p className="text-[10px] text-slate-400 mb-1">继续上次学习</p>
                    <h4 className="font-bold text-slate-900 text-[14px] leading-tight truncate">{inProgress.title}</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5 truncate">{inProgress.instructor}</p>
                    <div className="mt-2.5">
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-[#04285F] rounded-full" style={{ width: `${Math.max(inProgress.progress, 4)}%` }} />
                      </div>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-[10px] text-slate-500">{inProgress.progress}% 完成</span>
                        <span className="text-[10px] text-[#04285F] font-bold">继续学习 →</span>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            </>)}

            {/* FOCUSED TRACK BANNER (sticky just below fixed page header) */}
            {activeLevel !== '全部' && (() => {
              const tr = academicTracks.find(t => t.value === activeLevel);
              if (!tr) return null;
              const Icon = tr.icon;
              return (
                <section
                  className="px-4 pt-3 pb-3 bg-slate-50"
                  style={{
                    position: 'sticky',
                    top: 'var(--safe-top)',
                    zIndex: 40,
                  }}>
                  <button
                    onClick={() => setActiveLevel('全部')}
                    className="flex items-center text-[#04285F] font-semibold mb-3 active:scale-95 transition"
                    style={{ fontSize: 15, height: 28 }}
                  >
                    <ArrowLeft size={18} className="mr-1.5" strokeWidth={2.4} /> 返回学习中心
                  </button>
                  <div
                    className="relative overflow-hidden"
                    style={{
                      background: tr.baseColor,
                      borderRadius: 16,
                      boxShadow: '0 4px 14px rgba(16,24,40,0.08)',
                      minHeight: 96,
                    }}
                  >
                    <div
                      aria-hidden
                      style={{
                        position: 'absolute', top: 0, right: 0, bottom: 0,
                        width: '52%',
                        backgroundImage: `url('${tr.image}')`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center right',
                        opacity: 0.95,
                        WebkitMaskImage: 'linear-gradient(90deg, transparent 0%, black 65%, black 100%)',
                        maskImage: 'linear-gradient(90deg, transparent 0%, black 65%, black 100%)',
                      }}
                    />
                    <div
                      aria-hidden
                      style={{
                        position: 'absolute', inset: 0,
                        background: `linear-gradient(90deg, ${tr.baseColor} 0%, ${tr.baseColor} 50%, ${tr.baseColorTransparent} 78%)`,
                      }}
                    />
                    <div className="relative flex flex-col justify-between" style={{ padding: 14, zIndex: 1, minHeight: 96 }}>
                      <div className="flex items-center" style={{ gap: 10 }}>
                        <div
                          className="flex items-center justify-center flex-shrink-0"
                          style={{
                            width: 34, height: 34, borderRadius: '50%',
                            background: tr.titleColor,
                            boxShadow: '0 2px 6px rgba(16,24,40,0.18)',
                          }}
                        >
                          <Icon size={16} color="#FFFFFF" strokeWidth={2.4} />
                        </div>
                        <div className="min-w-0">
                          <div className="font-extrabold tracking-tight leading-none" style={{ fontSize: 17, color: tr.titleColor }}>
                            {tr.label}
                          </div>
                          <div className="font-semibold tracking-wider" style={{ fontSize: 10, color: tr.subColor, marginTop: 4 }}>
                            {tr.sub}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center" style={{ gap: 8, marginTop: 10 }}>
                        <span
                          className="font-bold"
                          style={{
                            fontSize: 10, padding: '3px 9px', borderRadius: 999,
                            background: '#FFFFFF', color: tr.titleColor,
                            boxShadow: '0 1px 3px rgba(16,24,40,0.08)',
                            lineHeight: '14px',
                          }}
                        >
                          {visibleCourses.length} 门
                        </span>
                        <span style={{ fontSize: 11, color: tr.descColor, fontWeight: 500 }}>{tr.desc}</span>
                      </div>
                    </div>
                  </div>
                </section>
              );
            })()}

            {/* CATEGORY FILTER CHIPS */}
            <section className="mt-4">
              {/* overflow-x:auto 会让 overflow-y 也变成 auto —— 这条横滚容器会把
                  chip 向上下扩出去的热区伪元素齐边裁掉。给容器留 8px 上下内边距，
                  再用等量负外边距把布局还原，伪元素才有地方待着。 */}
              <div className="flex overflow-x-auto scrollbar-hide px-4 py-2.5 -my-2.5" style={{ gap: 6 }}>
                {categories.map((cat) => {
                  const active = activeCategory === cat;
                  return (
                    <button
                      key={cat}
                      onClick={() => setActiveCategory(cat)}
                      /* 分类筛选条实测 31 高。这是一条横滚的紧凑 chip 行，
                         画成 44 会把整条撑得很笨重，所以只用伪元素向上下各扩 7px
                         （上方 section mt-4=16px、下方 mt-3=12px，都容得下）。
                         左右不扩，chip 之间只有 6px gap。 */
                      className="relative font-semibold whitespace-nowrap active:scale-95 transition flex-shrink-0 before:absolute before:-inset-y-[8px] before:inset-x-0 before:content-['']"
                      style={{
                        fontSize: 11,
                        padding: '6px 12px',
                        borderRadius: 999,
                        background: active ? '#04285F' : '#FFFFFF',
                        color: active ? '#FFFFFF' : '#5C6573',
                        border: active ? '1px solid #04285F' : '1px solid #E5E7EB',
                      }}
                    >
                      {cat}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* 6. FEATURED COURSES */}
            <section className="px-4 mt-3">
              <div className="flex items-end justify-between mb-2.5">
                <h3 className="text-[15px] font-bold text-slate-900">
                  {myCoursesOnly ? '我的课程' : (activeLevel === '全部' ? '精选课程' : '全部课程')}
                </h3>
              </div>
              <div className="space-y-3">
                {visibleCourses.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-100 py-12 flex flex-col items-center justify-center text-slate-400">
                    <BookOpen size={32} className="opacity-40" />
                    <p className="text-xs mt-3">暂无符合条件的课程</p>
                    <button
                      onClick={() => { setSearchQuery(''); setActiveCategory('全部'); setActiveLevel('全部'); }}
                      className="text-[11px] text-blue-600 mt-2"
                    >
                      清除筛选
                    </button>
                  </div>
                ) : (
                  (activeLevel === '全部' && !searchQuery.trim() ? visibleCourses.slice(0, 8) : visibleCourses).map((course) => {
                    const status = statusOf(course);
                    const tone = statusTone[status.kind];
                    return (
                      /* 整行可点，但原本是个带 onClick 的 <div> —— 键盘用户和读屏
                         用户根本够不到它，打不开任何一门课（行内那个「申请学习 /
                         查看课程」按钮是唯一的键盘入口，而它对需报名的课走的是
                         另一条分支）。加 role/tabIndex 与回车、空格键。
                         内层按钮已经 stopPropagation，不会被这层重复触发。 */
                      <div
                        key={course.id}
                        role="button"
                        tabIndex={0}
                        aria-label={`打开课程 ${course.title}`}
                        onClick={() => onCourseClick?.(course.id)}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter' && e.key !== ' ') return;
                          if (e.target !== e.currentTarget) return;  // 行内按钮自己处理
                          e.preventDefault();
                          onCourseClick?.(course.id);
                        }}
                        className="bg-white rounded-2xl border border-slate-100 active:scale-[0.99] transition cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-900"
                        style={{ boxShadow: '0 1px 4px rgba(16,24,40,0.04)', padding: 12 }}
                      >
                        <div className="flex" style={{ gap: 12 }}>
                          {/* Thumbnail */}
                          <ThumbnailTile course={course} fallbackUrl={thumbFor(course)} tintCss={tintFor(course)} size={88} />
                          {/* Right column */}
                          <div className="flex-1 min-w-0 flex flex-col" style={{ gap: 6 }}>
                            {/* Title + 收藏 */}
                            <div className="flex items-start" style={{ gap: 8 }}>
                              <h4
                                className="font-bold text-slate-900 line-clamp-1 tracking-tight flex-1 min-w-0"
                                style={{ fontSize: 15, lineHeight: '18px' }}
                              >
                                {course.title}
                              </h4>
                              {/* 列表直接收藏。
                                  `favoriteCourseIds` / `onToggleFavorite` 这两个 prop 本来就
                                  传进来了，却一直没人用 —— 收藏课程此前只能在详情页的
                                  「更多操作」下拉里点到，列表上没有入口。这里接的是**同一套
                                  状态**（App 的 favoriteCourseIds），不新建第二份数据，
                                  所以列表、详情页菜单、「我的」页的收藏课程计数天然一致。

                                  整行是可点的 role=button，所以这个按钮要挡住冒泡：
                                  onClick 里 stopPropagation 防止误触打开课程；
                                  行的 onKeyDown 已经有 `e.target !== e.currentTarget` 的判断，
                                  按钮上的回车/空格不会穿透，这里再显式 stopPropagation 兜一层。 */}
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); onToggleFavorite?.(course.id); }}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}
                                aria-pressed={favoriteCourseIds.includes(course.id)}
                                aria-label={`${favoriteCourseIds.includes(course.id) ? '取消收藏' : '收藏'}课程 ${course.title}`}
                                className="relative shrink-0 -mt-1 -mr-1 flex items-center justify-center rounded-full transition active:scale-90 before:absolute before:-inset-2 before:content-['']"
                                style={{ width: 28, height: 28 }}
                              >
                                <Heart
                                  size={17}
                                  strokeWidth={2.2}
                                  className={favoriteCourseIds.includes(course.id)
                                    ? 'text-rose-500 fill-rose-500'
                                    : 'text-slate-300'}
                                />
                              </button>
                            </div>

                            {/* Tag row */}
                            <div className="flex items-center flex-wrap" style={{ gap: 5 }}>
                              <span
                                className="font-semibold"
                                style={{
                                  fontSize: 10, padding: '2px 7px', borderRadius: 6,
                                  backgroundColor: tone.tagBg, color: tone.tagText,
                                  lineHeight: '14px',
                                }}
                              >
                                {status.tagText}
                              </span>
                              <span
                                className="font-semibold"
                                style={{
                                  fontSize: 10, padding: '2px 7px', borderRadius: 6,
                                  backgroundColor: '#F4F5F8', color: '#5C6573',
                                  lineHeight: '14px',
                                }}
                              >
                                {course.category}
                              </span>
                              <span
                                className="font-semibold"
                                style={{
                                  fontSize: 10, padding: '2px 7px', borderRadius: 6,
                                  backgroundColor: '#F4F5F8', color: '#5C6573',
                                  lineHeight: '14px',
                                }}
                              >
                                {programBucket(course.level)}
                              </span>
                            </div>

                            {/* Meta row: instructor · lessons · rating */}
                            <div className="flex items-center text-slate-500 truncate" style={{ fontSize: 11, gap: 8 }}>
                              <span className="truncate">{course.instructor}</span>
                              <span className="text-slate-300">·</span>
                              <span className="flex items-center flex-shrink-0">
                                <BookOpen size={11} className="mr-1" /> {course.totalLessons > 0 ? `${course.totalLessons} 课时` : '讲义筹备中'}
                              </span>
                            </div>

                            {/* 学习进度。
                                原本这一行完全不显示进度：一门已经学到 3/26 的课，
                                在列表里只写着「已解锁 · 继续学习」，看不出学到哪了 ——
                                要逐门点进详情页才知道。「我的」页的收藏课程早就有进度条，
                                两处口径不一致。这里补上同一个数（App 的 allCourses.progress，
                                与详情页、我的页同源）。 */}
                            {course.progress > 0 && (
                              <div className="flex items-center" style={{ gap: 6, marginTop: 2 }}>
                                <div
                                  className="flex-1 overflow-hidden"
                                  style={{ height: 4, borderRadius: 999, background: '#EEF1F6' }}
                                  role="progressbar"
                                  aria-label={`${course.title} 学习进度`}
                                  aria-valuenow={Math.round(course.progress)}
                                  aria-valuemin={0}
                                  aria-valuemax={100}
                                >
                                  <div
                                    style={{
                                      height: '100%', borderRadius: 999,
                                      width: `${Math.min(100, Math.max(0, course.progress))}%`,
                                      background: 'linear-gradient(90deg,#0A3878,#04285F)',
                                      transition: 'width .5s ease',
                                    }}
                                  />
                                </div>
                                <span className="shrink-0 font-bold" style={{ fontSize: 10, color: '#5C6573' }}>
                                  {Math.round(course.progress)}%
                                </span>
                              </div>
                            )}

                            {/* Action row */}
                            <div className="flex items-center justify-end mt-auto" style={{ paddingTop: 2 }}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (status.kind === 'apply') setEnrollPrompt(course);
                                  else onCourseClick?.(course.id);
                                }}
                                /* 课程卡右下角的行动键实测 29 高。卡片本身也可点，
                                   所以只向上下扩 9px（上方是讲师/课时那行纯文本，
                                   下方是卡片内边距），不抢卡片中心。 */
                                className="relative font-semibold transition active:scale-95 flex items-center before:absolute before:-inset-y-[9px] before:inset-x-0 before:content-['']"
                                style={{
                                  fontSize: 11,
                                  padding: '5px 10px',
                                  borderRadius: 8,
                                  border: `1px solid ${tone.btnBorder}`,
                                  color: tone.btnText,
                                  backgroundColor: '#FFFFFF',
                                  gap: 4,
                                }}
                              >
                                {status.btnText} <ChevronRight size={12} strokeWidth={2.4} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          </div>
        );
      })()}
    </div>
  );
};

export default CoursesView;
