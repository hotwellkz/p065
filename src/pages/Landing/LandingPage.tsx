import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { 
  Sparkles, 
  Wand2, 
  Calendar, 
  Zap, 
  Shield, 
  Bot, 
  PlayCircle,
  CheckCircle2,
  ArrowRight,
  MessageSquare,
  FolderOpen,
  Timer,
  Target,
  TrendingUp,
  Users,
  Settings,
  Video,
  Brain,
  Rocket,
  Infinity,
  Briefcase,
  DollarSign,
  TrendingDown,
  Building2,
  Key,
  CheckCircle,
  XCircle,
  Info,
  HelpCircle
} from "lucide-react";
import SEOHead from "../../components/SEOHead";

const LandingPage = () => {
  const [isVisible, setIsVisible] = useState(false);
  const heroRef = useRef<HTMLDivElement>(null);
  const featuresRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsVisible(true);
    
    // Intersection Observer для анимаций при скролле
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("fade-in-up");
          }
        });
      },
      { threshold: 0.1 }
    );

    const elements = document.querySelectorAll(".scroll-animate");
    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "ShortsAI Studio",
    description: "Контент-завод для массового производства и автопубликации видео в YouTube Shorts, TikTok и Instagram Reels. Автоматическая генерация сценариев, управление десятками каналов, автопостинг по расписанию.",
    url: "https://shortsai.ru",
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Web",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "RUB"
    },
    featureList: [
      "Автоматическая генерация сценариев и видеопромптов",
      "Массовое управление десятками каналов",
      "Автопубликация в YouTube Shorts, TikTok, Instagram Reels",
      "Интеграции Telegram, Google Drive, Blotato",
      "Мастер создания канала с AI-подсказками",
      "Автоматическое создание папок и организация файлов"
    ]
  };

  return (
    <>
      <SEOHead
        title="Контент-завод для Shorts, TikTok и Reels | Автогенерация и автопубликация видео"
        description="Фабрика видео-контента с автопубликацией: автоматическая генерация сценариев и видеопромптов, массовое управление каналами, автопостинг в YouTube Shorts, TikTok, Instagram Reels. Управляйте десятками каналов из одной панели."
        keywords="контент-завод, фабрика контента, автоматическая генерация видео, автопубликация видео, автоматизация контента, shorts автоматизация, tiktok автопостинг, youtube shorts автопубликация, массовое ведение каналов, ai автоматизация контента, нейросеть для коротких видео, автоматизация контент-маркетинга"
        structuredData={structuredData}
      />
      
      <div className="min-h-screen bg-[#0a0a0f] text-white overflow-x-hidden">
        {/* Hero-блок с премиальным дизайном */}
        <section 
          ref={heroRef}
          className="relative min-h-screen flex items-center justify-center overflow-hidden border-b border-white/5"
        >
          {/* Анимированный фон с градиентами */}
          <div className="absolute inset-0 wave-bg" />
          <div className="absolute inset-0 bg-gradient-to-br from-purple-950/20 via-blue-950/20 to-pink-950/20" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(139,92,246,0.1),transparent_70%)]" />
          
          {/* Светящиеся орбы */}
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-[100px] animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-pink-500/20 rounded-full blur-[100px] animate-pulse delay-1000" />
          <div className="absolute top-1/2 right-1/3 w-72 h-72 bg-cyan-500/15 rounded-full blur-[80px] animate-pulse delay-500" />

          <div className="relative z-10 mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
            <div className={`text-center transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
              {/* Badge */}
              <div className="mb-8 inline-flex items-center gap-2 rounded-full glass px-6 py-3 text-sm font-medium text-purple-300 neon-glow border border-purple-500/30">
                <Sparkles size={18} className="animate-pulse" />
                <span>ShortsAI Studio</span>
              </div>
              
              {/* Главный заголовок */}
              <h1 className="mb-6 text-5xl font-extrabold leading-tight tracking-tight sm:text-6xl md:text-7xl lg:text-8xl">
                <span className="block text-white mb-2">Контент-завод</span>
                <span className="block gradient-text">для Shorts, TikTok и Reels</span>
              </h1>
              
              {/* Подзаголовок */}
              <p className="mx-auto mb-12 max-w-3xl text-xl sm:text-2xl text-slate-300 leading-relaxed">
                Запустите собственный завод коротких видео: нейросеть генерирует контент, система автоматически публикует ролики в <span className="text-brand-light font-semibold">YouTube Shorts</span>, <span className="text-brand-light font-semibold">TikTok</span> и <span className="text-brand-light font-semibold">Instagram Reels</span>, а вы управляете десятками каналов из одной панели.
              </p>
              
              {/* CTA кнопки */}
              <div className="flex flex-col items-center justify-center gap-6 sm:flex-row">
                <Link
                  to="/auth"
                  className="group relative overflow-hidden rounded-2xl bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 px-10 py-5 text-lg font-bold text-white transition-all duration-300 neon-glow-hover hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/50"
                  style={{ backgroundSize: "200% 200%" }}
                >
                  <span className="relative z-10 flex items-center gap-3">
                    Запустить контент-завод
                    <ArrowRight size={24} className="transition-transform group-hover:translate-x-2" />
                  </span>
                  <div className="absolute inset-0 bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity animate-shimmer" style={{ backgroundSize: "200% 200%", animation: "gradient-shift 3s ease infinite" }} />
                </Link>
                <a
                  href="#features"
                  className="group rounded-2xl glass border border-white/20 px-10 py-5 text-lg font-semibold text-white transition-all duration-300 hover:border-purple-500/50 hover:bg-white/5 hover:scale-105"
                >
                  <span className="flex items-center gap-3">
                    Посмотреть, как это работает
                    <ArrowRight size={24} className="transition-transform group-hover:translate-x-2" />
                  </span>
                </a>
              </div>

              {/* Декоративный элемент - AI волна */}
              <div className="mt-20 flex items-center justify-center">
                <div className="relative w-full max-w-4xl h-32 overflow-hidden rounded-2xl glass border border-purple-500/20">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex gap-2">
                      {[...Array(20)].map((_, i) => (
                        <div
                          key={i}
                          className="w-1 bg-gradient-to-t from-purple-500 to-pink-500 rounded-full"
                          style={{
                            height: `${Math.random() * 60 + 20}px`,
                            animation: `float ${2 + Math.random() * 2}s ease-in-out infinite`,
                            animationDelay: `${i * 0.1}s`
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Премиальный блок "Революция в создании контента" */}
        <section className="relative border-y border-white/5 bg-gradient-to-br from-slate-950 via-purple-950/20 to-slate-950 px-4 py-20 sm:px-6 lg:px-8 lg:py-32 overflow-hidden">
          {/* Декоративные элементы фона */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(139,92,246,0.15),transparent_60%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_50%,rgba(236,72,153,0.1),transparent_60%)]" />
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-[120px] animate-pulse" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-pink-500/10 rounded-full blur-[120px] animate-pulse delay-1000" />
          
          <div className="relative z-10 mx-auto max-w-7xl">
            {/* Заголовок */}
            <div className="mb-12 text-center scroll-animate">
              <h2 className="mb-6 text-4xl font-extrabold text-white sm:text-5xl lg:text-6xl leading-tight">
                <span className="block mb-2">Ваш личный контент-завод,</span>
                <span className="block bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
                  работающий 24/7
                </span>
              </h2>
              
              {/* Подзаголовок */}
              <p className="mx-auto max-w-4xl text-lg sm:text-xl lg:text-2xl text-slate-300 leading-relaxed font-light">
                Вы один раз настраиваете свой канал — и система запускает бесконечный конвейер. 
                Каждую минуту она генерирует идеи, создаёт промпты, формирует видео и публикует их 
                в ваши соцсети строго по расписанию. <span className="text-brand-light font-semibold">Полностью автоматически. 24/7. Без вашего участия.</span>
              </p>
            </div>

            {/* Карточки преимуществ */}
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5 mt-16">
              {[
                {
                  icon: Sparkles,
                  title: "Автоматическая генерация",
                  description: "Идеи и сценарии создаются AI без вашего участия",
                  gradient: "from-purple-500/20 to-pink-500/20",
                  borderColor: "border-purple-500/30",
                  iconColor: "text-purple-400"
                },
                {
                  icon: Video,
                  title: "Создание промптов",
                  description: "VIDEO_PROMPT для Sora/Veo формируются автоматически",
                  gradient: "from-blue-500/20 to-cyan-500/20",
                  borderColor: "border-blue-500/30",
                  iconColor: "text-blue-400"
                },
                {
                  icon: Calendar,
                  title: "Автопубликация",
                  description: "В TikTok, YouTube Shorts, Instagram Reels по расписанию",
                  gradient: "from-emerald-500/20 to-teal-500/20",
                  borderColor: "border-emerald-500/30",
                  iconColor: "text-emerald-400"
                },
                {
                  icon: Timer,
                  title: "Работает 24/7",
                  description: "Круглосуточно, без вашего участия и контроля",
                  gradient: "from-amber-500/20 to-orange-500/20",
                  borderColor: "border-amber-500/30",
                  iconColor: "text-amber-400"
                },
                {
                  icon: Users,
                  title: "Десятки каналов",
                  description: "Управление из одной панели, масштабирование без границ",
                  gradient: "from-indigo-500/20 to-purple-500/20",
                  borderColor: "border-indigo-500/30",
                  iconColor: "text-indigo-400"
                }
              ].map((feature, index) => (
                <div
                  key={index}
                  className="group scroll-animate premium-card glass-strong rounded-2xl p-6 border border-white/10 hover:border-white/20 transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-brand/20"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className={`mb-4 inline-flex rounded-xl bg-gradient-to-br ${feature.gradient} p-3 ${feature.iconColor} border ${feature.borderColor} group-hover:scale-110 transition-transform duration-300`}>
                    <feature.icon size={24} className="neon-glow" aria-label={feature.title} />
                  </div>
                  <h3 className="mb-2 text-lg font-bold text-white">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>

            {/* Декоративный акцент */}
            <div className="mt-16 text-center">
              <div className="inline-flex items-center gap-3 rounded-full glass border border-purple-500/30 px-6 py-3 text-sm font-medium text-purple-300 neon-glow">
                <Infinity size={18} className="animate-pulse" />
                <span>Бесконечный конвейер контента</span>
              </div>
            </div>
          </div>
        </section>

        {/* Премиальный блок "Автоматизация маркетинга для бизнеса" */}
        <section className="relative border-y border-white/5 bg-gradient-to-br from-slate-950 via-indigo-950/30 to-slate-950 px-4 py-20 sm:px-6 lg:px-8 lg:py-32 overflow-hidden">
          {/* Декоративные элементы фона */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(99,102,241,0.12),transparent_70%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_70%,rgba(139,92,246,0.08),transparent_70%)]" />
          <div className="absolute top-1/4 left-0 w-72 h-72 bg-indigo-500/10 rounded-full blur-[100px] animate-pulse" />
          <div className="absolute bottom-1/4 right-0 w-72 h-72 bg-purple-500/10 rounded-full blur-[100px] animate-pulse delay-1000" />
          
          <div className="relative z-10 mx-auto max-w-7xl">
            {/* Заголовок */}
            <div className="mb-12 text-center scroll-animate">
              <h2 className="mb-6 text-4xl font-extrabold text-white sm:text-5xl lg:text-6xl leading-tight">
                <span className="block mb-2">Ваш бизнес заслуживает</span>
                <span className="block bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                  маркетинг, который работает сам
                </span>
              </h2>
              
              {/* Подзаголовок */}
              <p className="mx-auto max-w-4xl text-lg sm:text-xl lg:text-2xl text-slate-300 leading-relaxed font-light">
                Вы создали бизнес — но контент, соцсети и маркетинг забирают всё время.
                <br className="hidden sm:block" />
                Найм сотрудников стоит дорого, контроль — ещё дороже.
                <br className="hidden sm:block" />
                <span className="text-brand-light font-semibold">Контент-завод решает проблему:</span> он генерирует и публикует видео за вас.
                <br className="hidden sm:block" />
                <span className="text-white font-medium">Каждый день. 24/7.</span>
                <br className="hidden sm:block" />
                Как полноценная команда маркетологов, только быстрее, дешевле и без ошибок.
              </p>
            </div>

            {/* Карточки-аргументы */}
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 mt-16 mb-12">
              {[
                {
                  icon: Users,
                  title: "Экономит десятки сотрудников",
                  description: "Автоматически генерирует идеи, сценарии, промпты и готовые видео. Работает как виртуальная команда из десятков маркетологов.",
                  gradient: "from-indigo-500/20 to-purple-500/20",
                  borderColor: "border-indigo-500/30",
                  iconColor: "text-indigo-400"
                },
                {
                  icon: Rocket,
                  title: "Продвижение без усилий",
                  description: "Видео сами публикуются на все нужные платформы: TikTok, Instagram Reels, YouTube Shorts. Вы просто настраиваете расписание.",
                  gradient: "from-purple-500/20 to-pink-500/20",
                  borderColor: "border-purple-500/30",
                  iconColor: "text-purple-400"
                },
                {
                  icon: TrendingUp,
                  title: "Маркетинг на автопилоте",
                  description: "Ежедневный поток контента, который привлекает клиентов и растёт вместе с вашим бизнесом. Работает круглосуточно.",
                  gradient: "from-blue-500/20 to-cyan-500/20",
                  borderColor: "border-blue-500/30",
                  iconColor: "text-blue-400"
                },
                {
                  icon: Briefcase,
                  title: "Идеально для стартапов",
                  description: "Никакого опыта маркетинга не нужно — система делает всё. Мастер создания канала проведёт вас через каждый шаг.",
                  gradient: "from-emerald-500/20 to-teal-500/20",
                  borderColor: "border-emerald-500/30",
                  iconColor: "text-emerald-400"
                },
                {
                  icon: DollarSign,
                  title: "В сотни раз дешевле команды",
                  description: "Работает как отдел маркетинга, но без зарплат, больничных и текучки кадров. Один раз настраиваете — работает годами.",
                  gradient: "from-amber-500/20 to-orange-500/20",
                  borderColor: "border-amber-500/30",
                  iconColor: "text-amber-400"
                },
                {
                  icon: Building2,
                  title: "Масштабирование без границ",
                  description: "Управляйте десятками каналов из одной панели. Тестируйте ниши, форматы, аудитории — без найма дополнительных сотрудников.",
                  gradient: "from-pink-500/20 to-rose-500/20",
                  borderColor: "border-pink-500/30",
                  iconColor: "text-pink-400"
                }
              ].map((feature, index) => (
                <div
                  key={index}
                  className="group scroll-animate premium-card glass-strong rounded-2xl p-6 md:p-8 border border-white/10 hover:border-white/20 transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-brand/20"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className={`mb-5 inline-flex rounded-xl bg-gradient-to-br ${feature.gradient} p-4 ${feature.iconColor} border ${feature.borderColor} group-hover:scale-110 transition-transform duration-300`}>
                    <feature.icon size={28} className="neon-glow" aria-label={feature.title} />
                  </div>
                  <h3 className="mb-3 text-xl font-bold text-white">
                    {feature.title}
                  </h3>
                  <p className="text-sm md:text-base text-slate-400 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>

            {/* CTA блок */}
            <div className="text-center mt-12">
              <Link
                to="/auth"
                className="group relative inline-flex items-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 px-10 py-5 text-lg font-bold text-white transition-all duration-300 neon-glow-hover hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/50 md:px-12 md:py-6 md:text-xl"
                style={{ backgroundSize: "200% 200%" }}
                aria-label="Запустить маркетинг на автопилоте"
              >
                <span className="relative z-10 flex items-center gap-3">
                  Запустить маркетинг на автопилоте
                  <ArrowRight size={24} className="transition-transform group-hover:translate-x-2" />
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 opacity-0 group-hover:opacity-100 transition-opacity" style={{ backgroundSize: "200% 200%", animation: "gradient-shift 3s ease infinite" }} />
              </Link>
              <p className="mt-4 text-sm text-slate-400">
                Настройка займёт 3 минуты
              </p>
            </div>
          </div>
        </section>

        {/* Блок "Что делает приложение" - премиальные карточки */}
        <section 
          id="features" 
          ref={featuresRef}
          className="relative px-4 py-24 sm:px-6 lg:px-8 lg:py-32"
        >
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-purple-950/5 to-transparent" />
          
          <div className="relative z-10 mx-auto max-w-7xl">
            <div className="mb-16 text-center scroll-animate">
              <h2 className="mb-6 text-4xl font-bold text-white sm:text-5xl lg:text-6xl">
                Что автоматизирует контент-завод
              </h2>
              <p className="mx-auto max-w-2xl text-xl text-slate-400">
                Полный конвейер от идеи до публикации: генерация, организация и автопостинг видео во все основные площадки
              </p>
            </div>
            
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  icon: Brain,
                  title: "Автогенерация сценариев и видеопромптов",
                  description: "AI создаёт уникальные сценарии и VIDEO_PROMPT для Sora/Veo с учётом ниши, целевой аудитории, тона и запрещённых тем. Кнопки автоматической генерации ниш, ЦА и доп. пожеланий.",
                  gradient: "from-purple-500/20 to-pink-500/20",
                  borderColor: "border-purple-500/30",
                  iconColor: "text-purple-400"
                },
                {
                  icon: Settings,
                  title: "Мастер создания канала с AI-подсказками",
                  description: "Умный мастер настраивает каждый канал: ниша, ЦА, тон, режим генерации, доп. пожелания. AI-ассистент объясняет каждое поле простыми словами. Автозапуск для новых пользователей.",
                  gradient: "from-blue-500/20 to-cyan-500/20",
                  borderColor: "border-blue-500/30",
                  iconColor: "text-blue-400"
                },
                {
                  icon: FolderOpen,
                  title: "Автоконвейер файлов в Google Drive",
                  description: "Система автоматически создаёт папки для каждого канала, организует архив, выставляет права доступа. Всё настраивается одной кнопкой.",
                  gradient: "from-emerald-500/20 to-teal-500/20",
                  borderColor: "border-emerald-500/30",
                  iconColor: "text-emerald-400"
                },
                {
                  icon: Video,
                  title: "Автопубликация в YouTube, TikTok, Instagram",
                  description: "Интеграция с Blotato API: система автоматически публикует ролики по расписанию во все подключённые каналы. Глобальный API-ключ для всех каналов.",
                  gradient: "from-red-500/20 to-orange-500/20",
                  borderColor: "border-red-500/30",
                  iconColor: "text-red-400"
                },
                {
                  icon: Bot,
                  title: "Интеграции Telegram + Google Drive",
                  description: "Автоматическая отправка промптов через Telegram (личный или системный аккаунт), загрузка видео в Google Drive, синхронизация файлов между папками.",
                  gradient: "from-indigo-500/20 to-purple-500/20",
                  borderColor: "border-indigo-500/30",
                  iconColor: "text-indigo-400"
                },
                {
                  icon: Users,
                  title: "Управление десятками каналов",
                  description: "Одна панель для всех каналов: настройка расписания, включение/выключение автоматизации, мониторинг статуса. Масштабируйте производство контента без найма команды.",
                  gradient: "from-amber-500/20 to-yellow-500/20",
                  borderColor: "border-amber-500/30",
                  iconColor: "text-amber-400"
                }
              ].map((feature, index) => (
                <div
                  key={index}
                  className="premium-card scroll-animate glass-strong rounded-3xl p-8 border border-white/10"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className={`mb-6 inline-flex rounded-2xl bg-gradient-to-br ${feature.gradient} p-4 ${feature.iconColor} border ${feature.borderColor}`}>
                    <feature.icon size={32} className="neon-glow" />
                  </div>
                  <h3 className="mb-3 text-2xl font-bold text-white">
                    {feature.title}
                  </h3>
                  <p className="text-slate-400 leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Блок "Почему это лучше ручной работы" */}
        <section className="relative border-y border-white/5 bg-gradient-to-br from-slate-950/50 via-purple-950/20 to-slate-950/50 px-4 py-24 sm:px-6 lg:px-8 lg:py-32">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(139,92,246,0.1),transparent_50%)]" />
          
          <div className="relative z-10 mx-auto max-w-7xl">
            <div className="mb-16 text-center scroll-animate">
              <h2 className="mb-6 text-4xl font-bold text-white sm:text-5xl lg:text-6xl">
                Преимущества контент-завода
              </h2>
              <p className="mx-auto max-w-2xl text-xl text-slate-400">
                Массовое производство видео без ручной рутины: от генерации до публикации
              </p>
            </div>
            
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  icon: TrendingUp,
                  title: "10× быстрее",
                  description: "Чем писать сценарии самому. Генерация за секунды вместо часов",
                  color: "purple"
                },
                {
                  icon: Target,
                  title: "Стабильное качество",
                  description: "AI поддерживает единый стиль и тон для всех ваших каналов",
                  color: "blue"
                },
                {
                  icon: Timer,
                  title: "Контент по расписанию",
                  description: "Публикации выходят строго в запланированное время, без задержек",
                  color: "emerald"
                },
                {
                  icon: Users,
                  title: "10+ каналов из одной панели",
                  description: "Ведите десятки каналов одновременно: личный бренд, медиасеть, тестирование ниш. Всё управление в одном месте.",
                  color: "pink"
                },
                {
                  icon: Rocket,
                  title: "Стабильный поток контента",
                  description: "Автоматическая публикация по расписанию без пропусков и задержек. Контент выходит даже когда вы спите.",
                  color: "purple"
                },
                {
                  icon: Shield,
                  title: "Приватное хранение",
                  description: "Все данные хранятся безопасно в Firebase, только у вас",
                  color: "cyan"
                },
                {
                  icon: Zap,
                  title: "Минимум настроек — максимум результата",
                  description: "Один раз настройте канал через мастер, и система работает автоматически. Гибкие режимы генерации: сценарий, сценарий+промпт, только промпт для видео.",
                  color: "amber"
                }
              ].map((benefit, index) => {
                const colorClasses: Record<string, { bg: string; text: string; border: string }> = {
                  purple: { bg: "bg-purple-500/10", text: "text-purple-400", border: "border-purple-500/20" },
                  blue: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/20" },
                  emerald: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20" },
                  pink: { bg: "bg-pink-500/10", text: "text-pink-400", border: "border-pink-500/20" },
                  cyan: { bg: "bg-cyan-500/10", text: "text-cyan-400", border: "border-cyan-500/20" },
                  amber: { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20" }
                };
                const colors = colorClasses[benefit.color] || colorClasses.purple;
                
                return (
                  <div
                    key={index}
                    className="scroll-animate premium-card glass rounded-2xl p-8 border border-white/10"
                    style={{ animationDelay: `${index * 0.1}s` }}
                  >
                    <div className={`mb-6 inline-flex rounded-xl ${colors.bg} p-4 ${colors.text} border ${colors.border}`}>
                      <benefit.icon size={32} />
                    </div>
                    <h3 className="mb-3 text-xl font-bold text-white">
                      {benefit.title}
                    </h3>
                    <p className="text-slate-400 leading-relaxed">
                      {benefit.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Блок "Как это работает в 3 шага" */}
        <section className="relative px-4 py-24 sm:px-6 lg:px-8 lg:py-32">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-blue-950/5 to-transparent" />
          
          <div className="relative z-10 mx-auto max-w-7xl">
            <div className="mb-16 text-center scroll-animate">
              <h2 className="mb-6 text-4xl font-bold text-white sm:text-5xl lg:text-6xl">
                Как работает контент-завод
              </h2>
              <p className="mx-auto max-w-2xl text-xl text-slate-400">
                Полный конвейер от настройки до публикации: 4 простых шага
              </p>
            </div>
            
            <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  step: "1",
                  title: "Подключите интеграции",
                  description: "Авторизуйте Telegram (личный или системный аккаунт), Google Drive, укажите API-ключи Blotato. Система автоматически создаст папки для каналов.",
                  icon: Settings,
                  gradient: "from-purple-500 to-pink-500"
                },
                {
                  step: "2",
                  title: "Настройте каналы через мастер",
                  description: "Мастер создания канала: ниша, целевая аудитория, тон, запрещённые темы, режим генерации. AI-подсказки на каждом шаге. Кнопки автогенерации настроек.",
                  icon: Sparkles,
                  gradient: "from-blue-500 to-cyan-500"
                },
                {
                  step: "3",
                  title: "Автогенерация контента",
                  description: "Система генерирует сценарии и видеопромпты под каждую нишу. Режимы: только сценарий, сценарий+промпт, только промпт для видео (рекомендуется для автоматизации).",
                  icon: Brain,
                  gradient: "from-emerald-500 to-teal-500"
                },
                {
                  step: "4",
                  title: "Автопубликация по расписанию",
                  description: "Контент автоматически публикуется в YouTube Shorts, TikTok, Instagram Reels по вашему расписанию. Управляйте десятками каналов из одной панели.",
                  icon: Rocket,
                  gradient: "from-amber-500 to-orange-500"
                }
              ].map((step, index) => (
                <div
                  key={index}
                  className="scroll-animate relative text-center"
                  style={{ animationDelay: `${index * 0.2}s` }}
                >
                  <div className="mb-8 relative">
                    <div className={`mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br ${step.gradient} text-4xl font-bold text-white shadow-lg neon-glow`}>
                      {step.step}
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className={`h-24 w-24 rounded-full bg-gradient-to-br ${step.gradient} opacity-20 blur-2xl animate-pulse`} />
                    </div>
                  </div>
                  <div className="mb-6 inline-flex rounded-2xl glass p-4 border border-white/10 neon-glow">
                    <step.icon 
                      size={40} 
                      className={
                        index === 0 ? "text-purple-400" : 
                        index === 1 ? "text-blue-400" : 
                        index === 2 ? "text-emerald-400" :
                        "text-amber-400"
                      } 
                    />
                  </div>
                  <h3 className="mb-4 text-2xl font-bold text-white">
                    {step.title}
                  </h3>
                  <p className="text-slate-400 leading-relaxed">
                    {step.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Блок "Для кого" */}
        <section className="relative border-y border-white/5 bg-gradient-to-br from-slate-950/50 via-indigo-950/20 to-slate-950/50 px-4 py-24 sm:px-6 lg:px-8 lg:py-32">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_50%,rgba(99,102,241,0.1),transparent_50%)]" />
          
          <div className="relative z-10 mx-auto max-w-7xl">
            <div className="mb-16 text-center scroll-animate">
              <h2 className="mb-6 text-4xl font-bold text-white sm:text-5xl lg:text-6xl">
                Для кого подходит контент-завод
              </h2>
              <p className="mx-auto max-w-2xl text-xl text-slate-400">
                Продюсеры, маркетологи, блогеры, агентства и владельцы бизнеса — всем, кто хочет масштабировать производство видео
              </p>
            </div>
            
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  title: "Личный бренд",
                  description: "Ведите несколько каналов в разных нишах, тестируйте форматы, масштабируйте присутствие в соцсетях без найма команды.",
                  icon: Users,
                  gradient: "from-purple-500/20 to-pink-500/20"
                },
                {
                  title: "Медиасеть из десятков каналов",
                  description: "Управляйте целой сетью каналов из одной панели. Автоматизация публикаций, единый стиль, централизованное управление.",
                  icon: TrendingUp,
                  gradient: "from-blue-500/20 to-cyan-500/20"
                },
                {
                  title: "Тестирование гипотез в разных нишах",
                  description: "Быстро запускайте каналы в новых нишах, тестируйте аудитории и форматы. Автоматизация позволяет экспериментировать без больших затрат времени.",
                  icon: Target,
                  gradient: "from-emerald-500/20 to-teal-500/20"
                }
              ].map((useCase, index) => (
                <div
                  key={index}
                  className="scroll-animate premium-card glass rounded-2xl p-8 border border-white/10"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className={`mb-6 inline-flex rounded-xl bg-gradient-to-br ${useCase.gradient} p-4 text-white border border-white/20`}>
                    <useCase.icon size={32} />
                  </div>
                  <h3 className="mb-3 text-xl font-bold text-white">
                    {useCase.title}
                  </h3>
                  <p className="text-slate-400 leading-relaxed">
                    {useCase.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Блок "Как работает подключение API и генерации видео" */}
        <section className="relative border-y border-white/5 bg-gradient-to-br from-slate-950 via-blue-950/20 to-slate-950 px-4 py-20 sm:px-6 lg:px-8 lg:py-32 overflow-hidden">
          {/* Декоративные элементы фона */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(59,130,246,0.1),transparent_70%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_70%,rgba(139,92,246,0.08),transparent_70%)]" />
          
          <div className="relative z-10 mx-auto max-w-7xl">
            <div className="mb-16 text-center scroll-animate">
              <h2 className="mb-6 text-4xl font-extrabold text-white sm:text-5xl lg:text-6xl">
                Как работает подключение API и генерации видео
              </h2>
              <p className="mx-auto max-w-3xl text-xl text-slate-400">
                Всё, что нужно знать о настройке и подключении сервисов для автоматической генерации и публикации контента
              </p>
            </div>

            {/* Блок "Что предоставляет наш сервис" */}
            <div className="mb-16 scroll-animate">
              <div className="mb-8 text-center">
                <h3 className="mb-4 text-3xl font-bold text-white sm:text-4xl">
                  Что предоставляет наш сервис
                </h3>
                <p className="text-lg text-slate-400">
                  Всё готово из коробки — вам не нужно ничего настраивать
                </p>
              </div>
              
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  {
                    icon: CheckCircle,
                    title: "API-ключ OpenAI",
                    description: "Полностью за наш счёт. Весь AI-ассистент, подсказки, генерация сценариев, ниш, тона работают через наш ключ.",
                    gradient: "from-emerald-500/20 to-teal-500/20",
                    borderColor: "border-emerald-500/30",
                    iconColor: "text-emerald-400"
                  },
                  {
                    icon: Brain,
                    title: "Встроенный AI-ассистент",
                    description: "Умные подсказки на каждом шаге мастера создания канала. Объясняет каждое поле простыми словами.",
                    gradient: "from-purple-500/20 to-pink-500/20",
                    borderColor: "border-purple-500/30",
                    iconColor: "text-purple-400"
                  },
                  {
                    icon: Sparkles,
                    title: "Мастер создания каналов",
                    description: "Пошаговый мастер с AI-подсказками. Кнопки автогенерации ниш, целевой аудитории, запрещённых тем.",
                    gradient: "from-blue-500/20 to-cyan-500/20",
                    borderColor: "border-blue-500/30",
                    iconColor: "text-blue-400"
                  },
                  {
                    icon: Wand2,
                    title: "Автоматизация генерации",
                    description: "Автогенерация сценариев и видеопромптов под каждую нишу. Режимы: сценарий, сценарий+промпт, только промпт.",
                    gradient: "from-indigo-500/20 to-purple-500/20",
                    borderColor: "border-indigo-500/30",
                    iconColor: "text-indigo-400"
                  },
                  {
                    icon: FolderOpen,
                    title: "Автозагрузка в Google Drive",
                    description: "Автоматическое создание папок для каналов, маршрутизация файлов, обработка и размещение. Всё настраивается одной кнопкой.",
                    gradient: "from-amber-500/20 to-orange-500/20",
                    borderColor: "border-amber-500/30",
                    iconColor: "text-amber-400"
                  },
                  {
                    icon: Target,
                    title: "Умные рекомендации",
                    description: "Персональные рекомендации на основе ваших настроек канала. Система учится и предлагает оптимальные варианты.",
                    gradient: "from-pink-500/20 to-rose-500/20",
                    borderColor: "border-pink-500/30",
                    iconColor: "text-pink-400"
                  }
                ].map((feature, index) => (
                  <div
                    key={index}
                    className="premium-card glass-strong rounded-2xl p-6 border border-white/10 hover:border-white/20 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-brand/20"
                  >
                    <div className={`mb-4 inline-flex rounded-xl bg-gradient-to-br ${feature.gradient} p-3 ${feature.iconColor} border ${feature.borderColor}`}>
                      <feature.icon size={24} className="neon-glow" aria-label={feature.title} />
                    </div>
                    <h4 className="mb-2 text-lg font-bold text-white">
                      {feature.title}
                    </h4>
                    <p className="text-sm text-slate-400 leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Блок "Что нужно от вас" */}
            <div className="mb-16 scroll-animate">
              <div className="mb-8 text-center">
                <h3 className="mb-4 text-3xl font-bold text-white sm:text-4xl">
                  Что нужно от вас
                </h3>
                <p className="text-lg text-slate-400">
                  Минимум настроек для максимального результата
                </p>
              </div>
              
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  {
                    icon: FolderOpen,
                    title: "Подключить Google Drive",
                    description: "Один раз авторизуйте Google Drive — система автоматически создаст папки для всех ваших каналов.",
                    required: true,
                    gradient: "from-blue-500/20 to-cyan-500/20"
                  },
                  {
                    icon: Video,
                    title: "Подключить SyntaxBot",
                    description: "По желанию, если нужна генерация видео. SyntaxBot — хаб для всех современных моделей: SORA, Runway, Kling, Veo, Luma и десятки других.",
                    required: false,
                    gradient: "from-purple-500/20 to-pink-500/20"
                  },
                  {
                    icon: Key,
                    title: "API-ключ Blotato",
                    description: "Обязательно для автопубликации. Зарегистрируйтесь в Blotato, получите API-ключ и вставьте его в настройки аккаунта.",
                    required: true,
                    gradient: "from-emerald-500/20 to-teal-500/20"
                  },
                  {
                    icon: Calendar,
                    title: "Настроить расписание",
                    description: "Укажите время публикаций для каждого канала. Система будет автоматически публиковать контент по расписанию.",
                    required: true,
                    gradient: "from-amber-500/20 to-orange-500/20"
                  },
                  {
                    icon: Zap,
                    title: "Включить автоматизацию",
                    description: "Один клик в панели расписания — и контент-завод начинает работать. Включите/выключите для каждого канала отдельно.",
                    required: true,
                    gradient: "from-indigo-500/20 to-purple-500/20"
                  }
                ].map((requirement, index) => (
                  <div
                    key={index}
                    className="premium-card glass-strong rounded-2xl p-6 border border-white/10 hover:border-white/20 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-brand/20"
                  >
                    <div className="mb-4 flex items-start justify-between">
                      <div className={`inline-flex rounded-xl bg-gradient-to-br ${requirement.gradient} p-3 text-white border border-white/20`}>
                        <requirement.icon size={24} className="neon-glow" aria-label={requirement.title} />
                      </div>
                      {requirement.required ? (
                        <span className="rounded-full bg-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-400 border border-emerald-500/30">
                          Обязательно
                        </span>
                      ) : (
                        <span className="rounded-full bg-blue-500/20 px-2.5 py-1 text-xs font-semibold text-blue-400 border border-blue-500/30">
                          По желанию
                        </span>
                      )}
                    </div>
                    <h4 className="mb-2 text-lg font-bold text-white">
                      {requirement.title}
                    </h4>
                    <p className="text-sm text-slate-400 leading-relaxed">
                      {requirement.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Информационный блок про SyntaxBot */}
            <div className="scroll-animate glass-strong rounded-3xl border border-white/10 p-8 md:p-10 bg-gradient-to-br from-purple-950/30 to-indigo-950/30">
              <div className="mb-6 flex items-center gap-4">
                <div className="rounded-2xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 p-4 border border-purple-500/30">
                  <Video size={32} className="text-purple-400 neon-glow" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-white mb-2">
                    Можно ли генерировать видео бесплатно?
                  </h3>
                  <p className="text-slate-400">
                    Для генерации видео нужна подписка в SyntaxBot
                  </p>
                </div>
              </div>
              
              <div className="mb-6">
                <p className="text-slate-300 leading-relaxed mb-4">
                  <span className="font-semibold text-white">SyntaxBot</span> — это хаб, объединяющий все современные модели видео-генерации. 
                  После подключения вы получаете доступ ко всем сетям:
                </p>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
                  {["SORA", "Runway GEN-2/3/4", "Kling 1.5/2.0", "Google Veo", "Luma", "Pika", "Hedra", "Minimax", "Huggingface Video", "SeaDance", "Midjourney", "D-ID / Avatars", "Topaz AI"].map((model, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-white/10 bg-slate-900/40 px-3 py-2 text-center text-xs font-medium text-slate-300 hover:border-brand/30 hover:text-white transition-all"
                    >
                      {model}
                    </div>
                  ))}
                </div>
                
                <div className="rounded-xl border border-brand/30 bg-brand/10 p-4">
                  <p className="text-brand-light font-semibold leading-relaxed">
                    <span className="text-white">Какой бы генератор вы ни выбрали</span> — SyntaxBot подаёт промпт, получает видео и загружает в ваш Google Drive. Всё автоматически.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ блок */}
        <section className="relative px-4 py-24 sm:px-6 lg:px-8 lg:py-32">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-purple-950/5 to-transparent" />
          
          <div className="relative z-10 mx-auto max-w-4xl">
            <div className="mb-16 text-center scroll-animate">
              <h2 className="mb-6 text-4xl font-bold text-white sm:text-5xl lg:text-6xl">
                Частые вопросы
              </h2>
              <p className="mx-auto max-w-2xl text-xl text-slate-400">
                Всё, что нужно знать о безопасности и надёжности контент-завода
              </p>
            </div>
            
            <div className="space-y-6">
              {[
                {
                  question: "Нужен ли свой API-ключ OpenAI?",
                  answer: "Нет, API-ключ OpenAI пользователю не нужен. Весь AI-ассистент, подсказки, генерация сценариев, ниш, тона и дополнительных пожеланий работают через наш ключ. Пользователь ничего не настраивает, всё готово из коробки."
                },
                {
                  question: "Что нужно для автоматической публикации в TikTok, YouTube и Instagram?",
                  answer: "Для автоматической публикации роликов в соцсети требуется API-ключ Blotato. Это сервис, который позволяет загружать видео напрямую в TikTok, YouTube Shorts и Instagram Reels без ручных действий. Зарегистрируйтесь в Blotato, оформите подписку, сгенерируйте API-ключ и вставьте его в настройки аккаунта в нашем сервисе. Blotato — это единственный способ официальной загрузки видео через API в TikTok/YouTube/Instagram."
                },
                {
                  question: "Можно ли генерировать видео бесплатно?",
                  answer: "Для генерации видео пользователю нужна подписка в SyntaxBot — это хаб, объединяющий все современные модели видео-генерации (SORA, Runway, Kling, Veo, Luma, Pika и десятки других). После подключения SyntaxBot вы получаете доступ ко всем сетям. Какой бы генератор вы ни выбрали — SyntaxBot подаёт промпт, получает видео и загружает в ваш Google Drive. Всё автоматически."
                },
                {
                  question: "Безопасно ли хранить API-ключи и доступы к аккаунтам?",
                  answer: "Да. Все чувствительные данные (API-ключи, токены) шифруются перед сохранением в базе. Доступ к вашим аккаунтам соцсетей происходит только через официальные API (Blotato, Google Drive, Telegram) с вашими разрешениями. Мы не храним пароли от аккаунтов."
                },
                {
                  question: "Можно ли изменить настройки канала после создания?",
                  answer: "Конечно. Все настройки канала (ниша, ЦА, тон, запрещённые темы, режим генерации, доп. пожелания) можно редактировать в любой момент в настройках канала. Изменения применяются к новым генерациям."
                },
                {
                  question: "Что происходит, если остановить автоматизацию?",
                  answer: "Вы можете включить или выключить автоматизацию для каждого канала в панели расписания. При выключении генерация и публикация останавливаются, но все настройки и данные сохраняются. Включите обратно — и система продолжит работу."
                },
                {
                  question: "Сколько каналов можно вести одновременно?",
                  answer: "Без ограничений. Система позволяет управлять любым количеством каналов из одной панели. Каждый канал настраивается индивидуально: своя ниша, аудитория, расписание, режим генерации."
                }
              ].map((faq, index) => (
                <div
                  key={index}
                  className="scroll-animate glass rounded-2xl border border-white/10 p-6 md:p-8"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <h3 className="mb-3 text-lg font-bold text-white md:text-xl">
                    {faq.question}
                  </h3>
                  <p className="text-slate-400 leading-relaxed">
                    {faq.answer}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA-блок - мощный призыв */}
        <section className="relative border-y border-white/5 bg-gradient-to-r from-purple-950/30 via-pink-950/30 to-purple-950/30 px-4 py-24 sm:px-6 lg:px-8 lg:py-32 overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(139,92,246,0.2),transparent_70%)]" />
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-purple-600/10 via-transparent to-pink-600/10" />
          
          <div className="relative z-10 mx-auto max-w-4xl text-center">
            <h2 className="mb-6 text-4xl font-bold text-white sm:text-5xl lg:text-6xl">
              Готовы запустить свой контент-завод?
            </h2>
            <p className="mb-12 text-xl text-slate-300">
              Начните массовое производство видео уже сегодня. Мастер создания канала запустится автоматически для новых пользователей.
            </p>
            <Link
              to="/auth"
              className="group relative inline-flex items-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 px-12 py-6 text-xl font-bold text-white transition-all duration-300 neon-glow-hover hover:scale-105 hover:shadow-2xl hover:shadow-purple-500/50"
              style={{ backgroundSize: "200% 200%" }}
            >
              <span className="relative z-10 flex items-center gap-3">
                Запустить контент-завод
                <ArrowRight size={28} className="transition-transform group-hover:translate-x-2" />
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-purple-600 via-pink-600 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity" style={{ backgroundSize: "200% 200%", animation: "gradient-shift 3s ease infinite" }} />
            </Link>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-white/5 bg-slate-950 px-4 py-16 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <div className="mb-6 flex items-center gap-3">
                  <Sparkles size={28} className="text-purple-400" />
                  <span className="text-xl font-bold text-white">ShortsAI Studio</span>
                </div>
                <p className="text-sm text-slate-400 leading-relaxed">
                  Контент-завод для массового производства и автопубликации видео в Shorts, TikTok и Reels
                </p>
              </div>
              
              <div>
                <h4 className="mb-4 text-sm font-semibold text-white uppercase tracking-wider">Правовая информация</h4>
                <ul className="space-y-3">
                  <li>
                    <Link to="/privacy" className="text-sm text-slate-400 transition hover:text-purple-400">
                      Политика конфиденциальности
                    </Link>
                  </li>
                </ul>
              </div>
              
              <div>
                <h4 className="mb-4 text-sm font-semibold text-white uppercase tracking-wider">Контакты</h4>
                <ul className="space-y-3">
                  <li>
                    <a href="https://t.me/shortsai" target="_blank" rel="noopener noreferrer" className="text-sm text-slate-400 transition hover:text-purple-400 flex items-center gap-2">
                      <MessageSquare size={16} />
                      Telegram канал
                    </a>
                  </li>
                </ul>
              </div>
              
              <div>
                <h4 className="mb-4 text-sm font-semibold text-white uppercase tracking-wider">Документация</h4>
                <ul className="space-y-3">
                  <li>
                    <a href="https://github.com/hotwellkz/p015" target="_blank" rel="noopener noreferrer" className="text-sm text-slate-400 transition hover:text-purple-400">
                      GitHub
                    </a>
                  </li>
                </ul>
              </div>
            </div>
            
            <div className="mt-12 border-t border-white/5 pt-8 text-center text-sm text-slate-500">
              <p>© {new Date().getFullYear()} ShortsAI Studio. Все права защищены.</p>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
};

export default LandingPage;
