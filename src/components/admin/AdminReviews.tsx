'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { getAuth, onAuthStateChanged, User } from 'firebase/auth';
import { app } from '@/lib/firebase';
import axios from '@/lib/axiosInstance';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import { LIMITS } from '@/config/constants';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import {
  RefreshCw,
  Search,
  ChevronUp,
  ChevronDown,
  EyeOff,
  Megaphone,
  Trash2,
  Star,
  CalendarClock,
  Edit3,
  Lock,
  Loader2,
  AlertTriangle,
  ShieldCheck,
  Globe,
} from 'lucide-react';

interface Review {
  id: string;
  name: string;
  comment: string;
  stars: number;
  storeName: string;
  storeDomain?: string | null;
  published: boolean;
  status?: string;
  trustedBuyer?: boolean;
  platform?: string;
  images?: string[];
  createdAt?: string | number | Date;
  lastModified?: string;
}

interface ReviewsResponse {
  reviews: Review[];
  total: number;
  published: number;
  pending: number;
  averageRating: number;
  hasMore?: boolean;
  nextCursor?: string | null;
}

export default function AdminReviews() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [storeFilter, setStoreFilter] = useState('');
  const [starsFilter, setStarsFilter] = useState('all');
  const [publishedFilter, setPublishedFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'createdAt' | 'stars' | 'name'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const [stats, setStats] = useState({
    total: 0,
    published: 0,
    pending: 0,
    averageRating: 0,
  });

  const router = useRouter();

  useEffect(() => {
    const auth = getAuth(app);
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
      if (!currentUser) router.push('/login');
    });
    return () => unsubscribe();
  }, [router]);

  const fetchReviews = useCallback(async () => {
    if (!user) {
      setError('يرجى تسجيل الدخول أولاً');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const params = new URLSearchParams();

      params.append('limit', String(LIMITS.MAX_BATCH_SIZE));
      if (starsFilter && starsFilter !== 'all') params.append('stars', starsFilter);
      if (publishedFilter !== 'all') params.append('published', publishedFilter);
      if (sortBy) params.append('sortBy', sortBy);
      if (sortOrder) params.append('sortOrder', sortOrder);

      // ✅ دمج فلتر المتجر داخل البحث (حتى لو الـ API لا يدعم storeName)
      const searchMerged = [searchTerm, storeFilter].filter(Boolean).join(' ');
      if (searchMerged) params.append('search', searchMerged);

      const res = await axios.get<ReviewsResponse>(`/api/admin/reviews?${params.toString()}`);
      const data = res.data;

      setReviews(data.reviews || []);
      setStats({
        total: data.total ?? data.reviews.length,
        published: data.published ?? data.reviews.filter((r) => r.published).length,
        pending: data.pending ?? data.reviews.filter((r) => !r.published).length,
        averageRating:
          data.averageRating ??
          (data.reviews.length > 0
            ? data.reviews.reduce((acc, r) => acc + r.stars, 0) / data.reviews.length
            : 0),
      });
    } catch (error) {
      const err = error as { response?: { status?: number; data?: { message?: string } }; message?: string };
      if (err.response?.status === 401) {
        setError('غير مخول للوصول. يرجى التأكد من صلاحيات المشرف.');
        setTimeout(() => router.push('/'), 3000);
      } else if (err.response?.status === 403) {
        setError('ليس لديك صلاحية الوصول لهذه البيانات');
      } else {
        setError('حدث خطأ أثناء تحميل التقييمات: ' + (err.response?.data?.message || err.message || ''));
      }
    } finally {
      setLoading(false);
    }
  }, [user, storeFilter, starsFilter, publishedFilter, sortBy, sortOrder, searchTerm, router]);

  const togglePublish = async (id: string, current: boolean) => {
    if (!user) {
      alert('يرجى تسجيل الدخول أولاً');
      return;
    }
    try {
      setActionLoading(id);
      await axios.patch(`/api/admin/reviews/${id}`, {
        published: !current,
        lastModified: new Date().toISOString(),
      });
      setReviews((prev) =>
        prev.map((r) => (r.id === id ? { ...r, published: !current, lastModified: new Date().toISOString() } : r))
      );
      setStats((prev) => ({
        ...prev,
        published: current ? prev.published - 1 : prev.published + 1,
        pending: current ? prev.pending + 1 : prev.pending - 1,
      }));
    } catch (error) {
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      alert('فشل في تحديث حالة التقييم: ' + (err.response?.data?.message || err.message || ''));
    } finally {
      setActionLoading(null);
    }
  };

  const deleteReview = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا التقييم؟')) return;
    try {
      setActionLoading(id);
      await axios.delete(`/api/admin/reviews/${id}`, { data: { confirm: true, reason: 'admin delete' } });
      const deleted = reviews.find((r) => r.id === id);
      setReviews((prev) => prev.filter((r) => r.id !== id));
      setStats((prev) => ({
        ...prev,
        total: prev.total - 1,
        published: deleted?.published ? prev.published - 1 : prev.published,
        pending: !deleted?.published ? prev.pending - 1 : prev.pending,
      }));
    } catch (error) {
      const err = error as { response?: { data?: { message?: string } }; message?: string };
      alert('فشل في حذف التقييم: ' + (err.response?.data?.message || err.message || ''));
    } finally {
      setActionLoading(null);
    }
  };

  const getStarDisplay = (rating: number) => (
    <div className="flex items-center gap-0.5" aria-label={`Rating ${rating} of 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-4 w-4 transition-colors duration-300 ${i < rating ? 'text-primary' : 'text-muted-foreground'}`}
          fill={i < rating ? 'currentColor' : 'none'}
        />
      ))}
    </div>
  );

  const formatDate = (value?: string | number | Date) => {
    if (!value) return '-';
    const d = typeof value === 'number' ? new Date(value) : new Date(value);
    return new Intl.DateTimeFormat('ar-EG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  };

  const filteredReviews = useMemo(() => {
    if (!searchTerm && !storeFilter) return reviews;
    const searchLower = [searchTerm, storeFilter].filter(Boolean).join(' ').toLowerCase();
    return reviews.filter((review) =>
      [
        review.name,
        review.comment,
        review.storeName,
        review.storeDomain || '',
        review.platform || '',
        review.status || '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(searchLower),
    );
  }, [reviews, searchTerm, storeFilter]);

  useEffect(() => {
    if (!authLoading && user) fetchReviews();
  }, [fetchReviews, user, authLoading]);

  const StatCard = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) => (
    <Card className="animate-fade-in rounded-lg border border-border/60 bg-gradient-to-b from-card to-muted/30 shadow-sm transition-all duration-300 hover:shadow-md">
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className="text-2xl">{icon}</div>
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const StatusBadge = ({ published }: { published: boolean }) => (
    <Badge
      variant={published ? 'default' : 'secondary'}
      className={`rounded-full transition-all duration-200 ${published ? 'ring-1 ring-primary/20' : 'ring-1 ring-border/60'}`}
    >
      {published ? 'منشور' : 'في الانتظار'}
    </Badge>
  );

  const StoreChip = ({ name, domain }: { name: string; domain?: string | null }) => (
    <div className="flex flex-wrap items-center gap-2">
      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-sm">متجر: {name || 'غير محدد'}</span>
      {domain ? (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 text-xs">
          <Globe className="h-3 w-3" />
          {(() => {
            try { return new URL(domain).hostname; } catch { return domain; }
          })()}
        </span>
      ) : null}
    </div>
  );

  const TrustedBadge = ({ on }: { on?: boolean }) =>
    on ? (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-xs">
        <ShieldCheck className="h-3.5 w-3.5" /> مشتري موثق
      </span>
    ) : null;

  if (authLoading) {
    return (
      <Card className="min-h-[240px] flex items-center justify-center animate-fade-in">
        <CardContent className="w-full max-w-sm text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-r-2 border-primary" />
          <p className="text-muted-foreground">جاري التحقق من الهوية...</p>
        </CardContent>
      </Card>
    );
  }

  if (!user) {
    return (
      <Card className="p-8 text-center animate-fade-in border border-border/60 shadow-sm">
        <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-secondary flex items-center justify-center">
          <Lock className="h-6 w-6" />
        </div>
        <CardTitle className="mb-2">يرجى تسجيل الدخول للوصول لهذه الصفحة</CardTitle>
        <CardDescription className="mb-6">ستتم إعادة التوجيه إلى صفحة تسجيل الدخول</CardDescription>
        <Button onClick={() => router.push('/login')} className="transition-transform duration-200 hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          تسجيل الدخول
        </Button>
      </Card>
    );
  }

  return (
    <main className="space-y-6" dir="rtl">
      <section className="rounded-xl border bg-gradient-to-b from-background to-muted/30 p-5 md:p-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">إدارة التقييمات</h2>
            <p className="text-sm text-muted-foreground mt-1">مسجل باسم: {user.email}</p>
          </div>
          <Button
            onClick={fetchReviews}
            disabled={loading}
            variant="default"
            className="gap-2 transition-transform duration-200 hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> تحديث
          </Button>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard icon={<span>📊</span>} label="إجمالي التقييمات" value={stats.total} />
        <StatCard icon={<span>✅</span>} label="منشور" value={stats.published} />
        <StatCard icon={<span>⏳</span>} label="في الانتظار" value={stats.pending} />
        <StatCard icon={<span>⭐</span>} label="متوسط التقييم" value={stats.averageRating.toFixed(1)} />
      </section>

      {/* Filters */}
      <Card className="animate-fade-in sticky top-0 z-20 border border-border/60 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">الفلاتر</CardTitle>
          <CardDescription>ابحث وفلتر وقم بفرز التقييمات</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="البحث في التقييمات..."
                value={searchTerm}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                className="pr-9"
              />
            </div>
            <Input
              placeholder="فلترة حسب المتجر..."
              value={storeFilter}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStoreFilter(e.target.value)}
            />
            <Select value={starsFilter} onValueChange={(v: string) => setStarsFilter(v)}>
              <SelectTrigger>
                <SelectValue placeholder="جميع التقييمات" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع التقييمات</SelectItem>
                <SelectItem value="5">5 نجوم</SelectItem>
                <SelectItem value="4">4 نجوم</SelectItem>
                <SelectItem value="3">3 نجوم</SelectItem>
                <SelectItem value="2">2 نجمة</SelectItem>
                <SelectItem value="1">1 نجمة</SelectItem>
              </SelectContent>
            </Select>
            <Select value={publishedFilter} onValueChange={(v: string) => setPublishedFilter(v)}>
              <SelectTrigger>
                <SelectValue placeholder="جميع الحالات" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الحالات</SelectItem>
                <SelectItem value="true">منشور</SelectItem>
                <SelectItem value="false">في الانتظار</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Select value={sortBy} onValueChange={(v: 'createdAt' | 'stars' | 'name') => setSortBy(v)}>
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="createdAt">تاريخ الإنشاء</SelectItem>
                <SelectItem value="stars">التقييم</SelectItem>
                <SelectItem value="name">الاسم</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="w-10 p-0"
              aria-label="تبديل ترتيب الفرز"
            >
              {sortOrder === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid gap-4">
          <div className="flex items-center justify-center py-8">
            <div className="flex items-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="text-muted-foreground font-medium">جارٍ تحميل التقييمات...</span>
            </div>
          </div>
          {[1, 2, 3].map((i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
              <Card className="border border-border/60">
                <CardContent className="pt-6">
                  <div className="animate-pulse space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="h-5 w-1/3 bg-muted rounded" />
                      <div className="h-6 w-20 bg-muted rounded-full" />
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 bg-muted rounded" />
                      <div className="h-4 w-2/3 bg-muted rounded" />
                    </div>
                    <div className="h-20 w-full bg-muted rounded" />
                    <div className="flex gap-2">
                      <div className="h-8 w-16 bg-muted rounded" />
                      <div className="h-8 w-16 bg-muted rounded" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}

      {error && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3 }}>
          <Alert variant="destructive" className="animate-fade-in border-2" aria-live="assertive" role="alert">
            <AlertTriangle className="h-5 w-5" />
            <AlertTitle className="flex items-center gap-2">حدث خطأ أثناء تحميل التقييمات</AlertTitle>
            <AlertDescription className="mt-2">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <span>{error}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={fetchReviews} className="hover:scale-105 transition-transform">
                    <RefreshCw className="h-4 w-4 mr-1" />
                    إعادة المحاولة
                  </Button>
                </div>
              </div>
            </AlertDescription>
          </Alert>
        </motion.div>
      )}

      {!loading && !error && (
        <div className="space-y-4">
          {filteredReviews.length === 0 ? (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <Card className="p-12 text-center animate-fade-in border border-border/60 bg-gradient-to-br from-muted/20 to-muted/5">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                  className="text-6xl mb-4"
                >
                  📝
                </motion.div>
                <CardTitle className="text-xl mb-2 text-muted-foreground">لا توجد تقييمات</CardTitle>
                <CardDescription className="text-lg mb-4">
                  {searchTerm || publishedFilter !== 'all' ? 'لا توجد تقييمات تطابق معايير البحث' : 'لم يتم استلام أي تقييمات بعد'}
                </CardDescription>
                {(searchTerm || publishedFilter !== 'all') && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearchTerm('');
                      setStoreFilter('');
                      setPublishedFilter('all');
                    }}
                    className="hover:scale-105 transition-transform"
                  >
                    مسح الفلاتر
                  </Button>
                )}
              </Card>
            </motion.div>
          ) : (
            filteredReviews.map((review) => (
              <Card
                key={review.id}
                className={`group animate-fade-in transition-all duration-200 hover:shadow-md ${
                  !review.published ? 'ring-1 ring-amber-300/40' : 'border border-border/60'
                }`}
              >
                <CardContent className="pt-6">
                  <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                    <div className="flex-1 space-y-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="text-2xl">{getStarDisplay(review.stars)}</div>
                        <div className="min-w-[160px]">
                          <h3 className="font-semibold">{review.name}</h3>
                          <StoreChip name={review.storeName} domain={review.storeDomain ?? undefined} />
                        </div>
                        <StatusBadge published={review.published} />
                        <TrustedBadge on={review.trustedBuyer} />
                        {review.platform ? (
                          <span className="px-2 py-0.5 rounded bg-sky-50 text-sky-700 text-xs">{review.platform}</span>
                        ) : null}
                      </div>

                      {review.comment && (
                        <div className="rounded-lg border bg-muted/30 p-3 transition-colors duration-200 group-hover:bg-muted/50">
                          <p className="leading-relaxed">{review.comment}</p>
                        </div>
                      )}

                      {/* معرض صور مبسّط */}
                      {Array.isArray(review.images) && review.images.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {review.images.slice(0, 6).map((src, i) => (
                            <a
                              key={i}
                              href={src}
                              target="_blank"
                              rel="noreferrer"
                              className="block overflow-hidden rounded-lg border hover:opacity-90"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={src} alt={`review-image-${i}`} className="h-20 w-20 object-cover" />
                            </a>
                          ))}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <CalendarClock className="h-3.5 w-3.5" /> {formatDate(review.createdAt)}
                        </span>
                        {review.lastModified && (
                          <span className="inline-flex items-center gap-1">
                            <Edit3 className="h-3.5 w-3.5" /> آخر تعديل: {formatDate(review.lastModified)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col md:flex-row gap-2">
                      <Button
                        variant={review.published ? 'destructive' : 'default'}
                        onClick={() => togglePublish(review.id, review.published)}
                        disabled={actionLoading === review.id}
                        className="gap-2 transition-transform duration-200 hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        {actionLoading === review.id ? (
                          <div className="h-4 w-4 animate-spin border-b-2 border-r-2 rounded-full" />
                        ) : review.published ? (
                          <>
                            <EyeOff className="h-4 w-4" /> إخفاء
                          </>
                        ) : (
                          <>
                            <Megaphone className="h-4 w-4" /> نشر
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => deleteReview(review.id)}
                        disabled={actionLoading === review.id}
                        className="gap-2 transition-transform duration-200 hover:scale-[1.02] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        {actionLoading === review.id ? (
                          <div className="h-4 w-4 animate-spin border-b-2 border-r-2 rounded-full" />
                        ) : (
                          <>
                            <Trash2 className="h-4 w-4" /> حذف
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </main>
  );
}
