'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Bell,
  Box,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Cloud,
  Code2,
  Command,
  Cpu,
  Database,
  GitBranch,
  GitCompare,
  Grid2X2,
  Layers3,
  Lock,
  LogOut,
  Menu,
  MoreHorizontal,
  Network,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  TestTube2,
  Trash2,
  User as UserIcon,
  X,
  Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FindingsCommandCenter } from '@/components/findings'
import { ArchitectureGovernance } from '@/components/architecture'
import { ReviewComparisonView } from '@/components/comparison'
import {
  clearAuthToken,
  createProject,
  deleteProject,
  getArchitecture,
  getAuthToken,
  getBillingSubscription,
  getDependencies,
  getFindings,
  getGitHubStatus,
  getLatestAnalysis,
  getMe,
  getSecurity,
  listAnalyses,
  listProjects,
  login,
  logout,
  register,
  triggerAnalysis,
  pollAnalysisUntilDone,
  type ArchitectureGraph,
  type BillingSubscription,
  type DependencyItem,
  type Finding,
  type GitHubStatus,
  type Organization,
  type Project,
  type Review,
  type User,
} from '@/lib/api'

type NavItem = { label: string; icon: typeof Grid2X2 }

const primaryNav: NavItem[] = [
  { label: 'Dashboard', icon: Grid2X2 },
  { label: 'Projetos', icon: Box },
  { label: 'Análises', icon: Activity },
  { label: 'Comparação', icon: GitCompare },
  { label: 'Findings', icon: AlertCircle },
  { label: 'Architecture', icon: Network },
  { label: 'Security', icon: ShieldCheck },
  { label: 'Dependencies', icon: Layers3 },
  { label: 'Quality Gates', icon: CheckCircle2 },
]

const secondaryNav: NavItem[] = [
  { label: 'Settings', icon: Settings2 },
  { label: 'Integrações', icon: GitBranch },
  { label: 'Billing', icon: Zap },
]

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex size-8 items-center justify-center rounded-[10px] bg-primary text-primary-foreground shadow-sm">
        <Sparkles className="size-4" />
      </div>
      <span className="text-[15px] font-semibold tracking-[-0.02em]">QualityGuard</span>
    </div>
  )
}

function ScoreRing({ score }: { score: number | null }) {
  if (score === null || Number.isNaN(score)) {
    return (
      <div className="relative flex size-28 shrink-0 flex-col items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/30">
        <span className="text-2xl font-semibold text-muted-foreground">—</span>
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground">No data</span>
      </div>
    )
  }

  const radius = 42
  const circumference = 2 * Math.PI * radius
  const clampedScore = Math.max(0, Math.min(100, score))
  const offset = circumference - (clampedScore / 100) * circumference

  return (
    <div className="relative size-28 shrink-0">
      <svg className="size-full -rotate-90" viewBox="0 0 100 100" aria-label={`Quality score ${clampedScore}`} role="img">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="currentColor" strokeWidth="7" className="text-muted" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="7"
          strokeLinecap="round"
          className={clampedScore >= 80 ? 'text-emerald-500' : clampedScore >= 50 ? 'text-amber-500' : 'text-rose-500'}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-semibold tracking-[-0.06em]">{clampedScore}</span>
        <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Score</span>
      </div>
    </div>
  )
}

function MetricCard({
  label,
  value,
  subtext,
  icon: Icon,
  tone = 'default',
}: {
  label: string
  value: string | number
  subtext: string
  icon: typeof Activity
  tone?: 'default' | 'warn' | 'good'
}) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-[-0.04em]">{value}</p>
        </div>
        <div
          className={`flex size-8 items-center justify-center rounded-lg ${
            tone === 'warn'
              ? 'bg-amber-100 text-amber-700'
              : tone === 'good'
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-primary/10 text-primary'
          }`}
        >
          <Icon className="size-4" />
        </div>
      </div>
      <p className={`mt-3 text-[11px] font-medium ${tone === 'warn' ? 'text-amber-700' : tone === 'good' ? 'text-emerald-700' : 'text-muted-foreground'}`}>
        {subtext}
      </p>
    </div>
  )
}

export default function Page() {
  const [active, setActive] = useState('Dashboard')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [search, setSearch] = useState('')

  // Authentication State
  const [user, setUser] = useState<User | null>(null)
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authOrgName, setAuthOrgName] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(false)

  // Project & Analysis Data
  const [projects, setProjects] = useState<Project[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [latestReview, setLatestReview] = useState<Review | null>(null)
  const [allReviews, setAllReviews] = useState<Review[]>([])
  const [architectureGraph, setArchitectureGraph] = useState<ArchitectureGraph | null>(null)
  const [dependenciesList, setDependenciesList] = useState<DependencyItem[]>([])
  const [securityData, setSecurityData] = useState<{ score: number | null; findings: Finding[]; totalSecurityFindings: number } | null>(null)
  const [githubStatus, setGithubStatus] = useState<GitHubStatus | null>(null)
  const [billingSubscription, setBillingSubscription] = useState<BillingSubscription | null>(null)

  // Modals & Action States
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisStatus, setAnalysisStatus] = useState<string | null>(null)
  const [newProjectModalOpen, setNewProjectModalOpen] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectRepo, setNewProjectRepo] = useState('')
  const [newProjectBranch, setNewProjectBranch] = useState('release/2.2')
  const [projectCreateLoading, setProjectCreateLoading] = useState(false)
  const [projectCreateError, setProjectCreateError] = useState<string | null>(null)

  // Data Loading & Error States
  const [loading, setLoading] = useState(true)
  const [globalError, setGlobalError] = useState<string | null>(null)

  const activeProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? projects[0] ?? null,
    [projects, selectedProjectId],
  )

  const loadInitialData = useCallback(async () => {
    setLoading(true)
    setGlobalError(null)
    try {
      const token = getAuthToken()
      if (!token) {
        // Automatically create a default guest session or prompt login
        setAuthModalOpen(true)
        setLoading(false)
        return
      }

      const me = await getMe()
      setUser(me.user)
      setOrganization(me.organization)
      setProjects(me.projects)

      const initialProjectId = me.projects[0]?.id ?? null
      if (initialProjectId) {
        setSelectedProjectId(initialProjectId)
        try {
          const latest = await getLatestAnalysis(initialProjectId)
          setLatestReview(latest)
        } catch {
          setLatestReview(null)
        }
      }

      // Load integrations and billing in background
      getGitHubStatus().then(setGithubStatus).catch(() => {})
      getBillingSubscription().then(setBillingSubscription).catch(() => {})
      listAnalyses().then(setAllReviews).catch(() => {})
    } catch (error) {
      console.warn('Session expired or invalid, resetting authentication:', error)
      clearAuthToken()
      setUser(null)
      setOrganization(null)
      setProjects([])
      setSelectedProjectId(null)
      setLatestReview(null)
      setAuthModalOpen(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadInitialData()
  }, [loadInitialData])

  const loadProjectDetails = useCallback(async (projectId: string) => {
    try {
      const [latest, arch, deps, sec] = await Promise.allSettled([
        getLatestAnalysis(projectId),
        getArchitecture(projectId),
        getDependencies(projectId),
        getSecurity(projectId),
      ])

      setLatestReview(latest.status === 'fulfilled' ? latest.value : null)
      setArchitectureGraph(arch.status === 'fulfilled' ? arch.value : null)
      setDependenciesList(deps.status === 'fulfilled' ? deps.value : [])
      setSecurityData(sec.status === 'fulfilled' ? sec.value : null)
    } catch (error) {
      console.warn('Error loading project details:', error)
    }
  }, [])

  useEffect(() => {
    if (selectedProjectId) {
      loadProjectDetails(selectedProjectId)
    }
  }, [selectedProjectId, loadProjectDetails])

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError(null)
    setAuthLoading(true)

    try {
      if (authMode === 'register') {
        await register(authEmail, authPassword, authOrgName || undefined)
      } else {
        await login(authEmail, authPassword)
      }
      setAuthModalOpen(false)
      await loadInitialData()
    } catch (error) {
      setAuthError((error as Error).message)
    } finally {
      setAuthLoading(false)
    }
  }

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newProjectName.trim() || !newProjectRepo.trim()) {
      setProjectCreateError('Nome e repositório são obrigatórios.')
      return
    }

    setProjectCreateLoading(true)
    setProjectCreateError(null)

    try {
      const created = await createProject({
        name: newProjectName.trim(),
        repository: newProjectRepo.trim(),
        branch: newProjectBranch.trim() || 'main',
      })

      setNewProjectModalOpen(false)
      setNewProjectName('')
      setNewProjectRepo('')
      setNewProjectBranch('release/2.2')

      const updatedProjects = await listProjects()
      setProjects(updatedProjects)
      setSelectedProjectId(created.id)
      await loadProjectDetails(created.id)
    } catch (error) {
      setProjectCreateError((error as Error).message)
    } finally {
      setProjectCreateLoading(false)
    }
  }

  const handleDeleteProject = async (projectId: string) => {
    if (!confirm('Tem certeza que deseja remover este projeto?')) return
    try {
      await deleteProject(projectId)
      const updatedProjects = await listProjects()
      setProjects(updatedProjects)
      if (selectedProjectId === projectId) {
        const nextId = updatedProjects[0]?.id ?? null
        setSelectedProjectId(nextId)
      }
    } catch (error) {
      alert(`Falha ao remover projeto: ${(error as Error).message}`)
    }
  }

  const handleRunAnalysis = async () => {
    if (!activeProject) {
      setNewProjectModalOpen(true)
      return
    }

    setIsAnalyzing(true)
    setAnalysisStatus('Job enfileirado (queued)...')
    setGlobalError(null)

    try {
      const trigger = await triggerAnalysis(activeProject.id, activeProject.branch)
      setAnalysisStatus(`Status: ${trigger.status} (${trigger.progress}%)`)

      const completedJob = await pollAnalysisUntilDone(
        trigger.analysisId,
        (job) => {
          if (job.status === 'cloning') {
            setAnalysisStatus(`Clonando repositório ${activeProject.repository} (${job.progress}%)...`)
          } else if (job.status === 'analyzing') {
            setAnalysisStatus(`Executando regras AST, grafo e quality gates (${job.progress}%)...`)
          } else if (job.status === 'queued') {
            setAnalysisStatus(`Fila de processamento: aguardando worker (${job.progress}%)...`)
          }
        },
        120,
        500,
      )

      if (completedJob.status === 'failed') {
        throw new Error(completedJob.error ?? 'Falha desconhecida no worker de análise')
      }

      if (completedJob.result) {
        setLatestReview(completedJob.result)
      }

      setAnalysisStatus('Análise concluída com sucesso!')
      await loadProjectDetails(activeProject.id)
      const reviews = await listAnalyses()
      setAllReviews(reviews)
    } catch (error) {
      setGlobalError(`Falha na análise: ${(error as Error).message}`)
    } finally {
      setIsAnalyzing(false)
      setTimeout(() => setAnalysisStatus(null), 3500)
    }
  }

  const handleLogout = () => {
    logout()
    setUser(null)
    setOrganization(null)
    setProjects([])
    setLatestReview(null)
    setAuthModalOpen(true)
  }

  const goTo = (label: string) => {
    setActive(label)
    setMobileOpen(false)
  }

  const currentFindings = useMemo(() => latestReview?.findings ?? [], [latestReview])

  const visibleFindings = useMemo(() => {
    if (!search.trim()) return currentFindings
    const q = search.toLowerCase()
    return currentFindings.filter(
      (f) =>
        f.title.toLowerCase().includes(q) ||
        f.file.toLowerCase().includes(q) ||
        (f.ruleId && f.ruleId.toLowerCase().includes(q)) ||
        f.severity.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q),
    )
  }, [currentFindings, search])

  const findingsBySeverity = useMemo(() => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
    for (const f of currentFindings) {
      if (f.status === 'open' && f.severity in counts) {
        counts[f.severity]++
      }
    }
    return counts
  }, [currentFindings])

  const userInitials = useMemo(() => {
    if (!user?.email) return 'QG'
    return user.email.slice(0, 2).toUpperCase()
  }, [user])

  return (
    <div className="min-h-screen bg-muted/35 text-foreground">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-[252px] flex-col border-r bg-sidebar px-3 py-4 transition-transform lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-3 pb-7 pt-1">
          <Logo />
        </div>
        <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Workspace
        </div>
        <div className="flex flex-col gap-1">
          {primaryNav.map(({ label, icon: Icon }) => (
            <button
              key={label}
              onClick={() => goTo(label)}
              className={`nav-item ${active === label ? 'nav-item-active' : ''}`}
              aria-current={active === label ? 'page' : undefined}
            >
              <Icon className="size-[17px]" />
              {label}
              {label === 'Findings' && currentFindings.length > 0 && (
                <span className="ml-auto rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                  {currentFindings.length}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="mt-7 px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Manage
        </div>
        <div className="flex flex-col gap-1">
          {secondaryNav.map(({ label, icon: Icon }) => (
            <button
              key={label}
              onClick={() => goTo(label)}
              className={`nav-item ${active === label ? 'nav-item-active' : ''}`}
            >
              <Icon className="size-[17px]" />
              {label}
            </button>
          ))}
        </div>

        {/* Plan card */}
        <div className="mt-auto rounded-xl border bg-background/70 p-3">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <Cloud className="size-3.5" />
            </div>
            <div>
              <p className="text-xs font-semibold capitalize">
                {organization?.plan ? `${organization.plan} plan` : 'No plan active'}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {projects.length} {projects.length === 1 ? 'project' : 'projects'} registered
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="mt-3 w-full bg-transparent" onClick={() => goTo('Billing')}>
            Manage billing <ArrowUpRight data-icon="inline-end" />
          </Button>
        </div>

        {/* User Card */}
        {user ? (
          <div className="mt-3 flex items-center gap-2 rounded-xl p-2.5 hover:bg-muted">
            <div className="flex size-8 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
              {userInitials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">{organization?.name ?? 'Workspace'}</p>
              <p className="truncate text-[10px] text-muted-foreground">{user.email}</p>
            </div>
            <button onClick={handleLogout} title="Sair" className="text-muted-foreground hover:text-foreground">
              <LogOut className="size-4" />
            </button>
          </div>
        ) : (
          <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => setAuthModalOpen(true)}>
            Sign in
          </Button>
        )}
      </aside>

      {mobileOpen && (
        <button
          className="fixed inset-0 z-20 bg-slate-950/30 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Fechar menu"
        />
      )}

      <div className="lg:pl-[252px]">
        {/* Header */}
        <header className="sticky top-0 z-10 flex h-[68px] items-center gap-3 border-b bg-background/90 px-4 backdrop-blur-md sm:px-7">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu />
          </Button>
          <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
            <span>Workspace</span>
            <ChevronRight className="size-3.5" />
            <span className="font-medium text-foreground">{active}</span>
            {activeProject && (
              <>
                <ChevronRight className="size-3.5" />
                <span className="rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-foreground">
                  {activeProject.name} ({activeProject.branch ?? 'main'})
                </span>
              </>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search findings, rules, files..."
                className="h-8 w-56 rounded-lg border bg-muted/40 pl-9 pr-3 text-xs outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setNewProjectModalOpen(true)}
            >
              <Plus className="size-3.5" />
              Add project
            </Button>
            <div className="mx-1 h-5 w-px bg-border" />
            <Button
              variant="outline"
              size="sm"
              className="hidden gap-2 sm:inline-flex"
              onClick={() => goTo('Integrações')}
            >
              <GitBranch />
              <span className="hidden xl:inline">
                {githubStatus?.configured ? 'GitHub connected' : 'GitHub not configured'}
              </span>
              <ChevronDown />
            </Button>
          </div>
        </header>

        {/* Global Error Banner */}
        {globalError && (
          <div className="mx-4 mt-4 flex items-center justify-between rounded-xl bg-destructive/10 p-4 text-xs text-destructive sm:mx-7">
            <span>{globalError}</span>
            <Button variant="ghost" size="sm" onClick={() => setGlobalError(null)}>
              Fechar
            </Button>
          </div>
        )}

        {/* Analysis Status Banner */}
        {analysisStatus && (
          <div className="mx-4 mt-4 flex items-center gap-2 rounded-xl bg-primary/10 p-3 text-xs text-primary sm:mx-7">
            <RefreshCw className="size-3.5 animate-spin" />
            <span>{analysisStatus}</span>
          </div>
        )}

        {/* Main Workspace Content */}
        <main className="mx-auto max-w-[1440px] p-4 sm:p-7">
          {/* Top Title & Action */}
          <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="mb-1 text-xs font-medium text-primary">
                {new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
              <h1 className="text-2xl font-semibold tracking-[-0.04em] sm:text-[30px]">
                {user ? `Workspace: ${organization?.name ?? 'QualityGuard'}` : 'QualityGuard Workspace'}
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {activeProject
                  ? `Active project: ${activeProject.name} (${activeProject.repository})`
                  : 'No project selected. Register a project to begin code quality governance.'}
              </p>
            </div>
            <div className="flex gap-2">
              {projects.length > 0 && (
                <select
                  value={selectedProjectId ?? ''}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  aria-label="Select active project"
                  className="h-8 rounded-lg border bg-background px-2.5 text-xs font-medium outline-none"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.branch ?? 'main'})
                    </option>
                  ))}
                </select>
              )}
              <Button onClick={handleRunAnalysis} disabled={isAnalyzing}>
                <RefreshCw data-icon="inline-start" className={isAnalyzing ? 'animate-spin' : ''} />
                {isAnalyzing ? 'Analyzing repository...' : 'Analyze repository'}
              </Button>
            </div>
          </div>

          {/* TAB 1: DASHBOARD */}
          {active === 'Dashboard' && (
            <>
              {/* Quality Overview & AI Insight */}
              <section className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
                <div className="rounded-2xl border bg-card p-5 sm:p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold">Quality overview</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {activeProject ? `${activeProject.name} / ${activeProject.branch ?? 'main'}` : 'No active project'}
                      </p>
                    </div>
                    {latestReview && (
                      <Button variant="ghost" size="sm" onClick={() => goTo('Análises')}>
                        View analysis <ArrowUpRight data-icon="inline-end" />
                      </Button>
                    )}
                  </div>

                  {latestReview ? (
                    <div className="mt-6 flex flex-col gap-6 sm:flex-row sm:items-center">
                      <div className="flex items-center gap-5">
                        <ScoreRing score={latestReview.score} />
                        <div>
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <span
                              className={`size-2 rounded-full ${
                                latestReview.gate?.passed ? 'bg-emerald-500' : 'bg-rose-500'
                              }`}
                            />
                            {latestReview.gate?.passed ? 'Healthy quality gate' : 'Quality gate blocked'}
                          </div>
                          <p className="mt-2 max-w-[220px] text-xs leading-5 text-muted-foreground">
                            {latestReview.analyzedFiles} files analyzed. Decision: {latestReview.decision.toUpperCase()}.
                          </p>
                          <Button variant="link" className="mt-1 h-auto p-0 text-xs" onClick={() => goTo('Findings')}>
                            See {latestReview.findings.length} findings <ArrowUpRight data-icon="inline-end" />
                          </Button>
                        </div>
                      </div>

                      {/* Subcategory bars */}
                      <div className="grid flex-1 grid-cols-2 gap-x-5 gap-y-4 border-t pt-5 sm:border-l sm:border-t-0 sm:pl-7">
                        <div>
                          <p className="text-[11px] text-muted-foreground">Architecture</p>
                          <div className="mt-2 flex items-center gap-2">
                            <div className="h-1.5 flex-1 rounded-full bg-muted">
                              <div
                                className="h-1.5 rounded-full bg-primary"
                                style={{ width: `${latestReview.categoryScores?.architecture ?? 100}%` }}
                              />
                            </div>
                            <span className="text-xs font-semibold">
                              {latestReview.categoryScores?.architecture ?? 100}
                            </span>
                          </div>
                        </div>

                        <div>
                          <p className="text-[11px] text-muted-foreground">Security</p>
                          <div className="mt-2 flex items-center gap-2">
                            <div className="h-1.5 flex-1 rounded-full bg-muted">
                              <div
                                className="h-1.5 rounded-full bg-amber-500"
                                style={{ width: `${latestReview.categoryScores?.security ?? 100}%` }}
                              />
                            </div>
                            <span className="text-xs font-semibold">
                              {latestReview.categoryScores?.security ?? 100}
                            </span>
                          </div>
                        </div>

                        <div>
                          <p className="text-[11px] text-muted-foreground">Testing</p>
                          <div className="mt-2 flex items-center gap-2">
                            {latestReview.coverage?.lines.percentage != null || latestReview.categoryScores?.testing != null ? (
                              <>
                                <div className="h-1.5 flex-1 rounded-full bg-muted">
                                  <div
                                    className="h-1.5 rounded-full bg-primary"
                                    style={{
                                      width: `${latestReview.coverage?.lines.percentage ?? latestReview.categoryScores?.testing ?? 0}%`,
                                    }}
                                  />
                                </div>
                                <span className="text-xs font-semibold">
                                  {latestReview.coverage?.lines.percentage ?? latestReview.categoryScores?.testing}%
                                </span>
                              </>
                            ) : (
                              <span className="text-[11px] font-medium text-muted-foreground">
                                Coverage data unavailable
                              </span>
                            )}
                          </div>
                        </div>

                        <div>
                          <p className="text-[11px] text-muted-foreground">Dependencies</p>
                          <div className="mt-2 flex items-center gap-2">
                            <div className="h-1.5 flex-1 rounded-full bg-muted">
                              <div
                                className="h-1.5 rounded-full bg-primary"
                                style={{ width: `${latestReview.categoryScores?.dependencies ?? 100}%` }}
                              />
                            </div>
                            <span className="text-xs font-semibold">
                              {latestReview.dependencies?.length ?? 0}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-6 flex flex-col items-center justify-center rounded-xl bg-muted/40 p-8 text-center">
                      <p className="text-sm font-medium">No analysis available yet</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Execute your first real repository analysis to inspect quality score and findings.
                      </p>
                      <Button size="sm" className="mt-4" onClick={handleRunAnalysis}>
                        Run your first analysis
                      </Button>
                    </div>
                  )}
                </div>

                {/* AI Insight Card */}
                <div className="rounded-2xl border bg-primary p-5 text-primary-foreground sm:p-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold">Quality intelligence</p>
                      <p className="mt-1 text-xs text-primary-foreground/70">
                        {latestReview ? 'Generated from latest analysis' : 'No analysis available'}
                      </p>
                    </div>
                    <div className="rounded-lg bg-primary-foreground/15 p-2">
                      <Sparkles className="size-4" />
                    </div>
                  </div>
                  <p className="mt-7 text-[15px] font-medium leading-6">
                    {latestReview?.aiInsight
                      ? `"${latestReview.aiInsight}"`
                      : 'Run a repository analysis to generate automated quality governance insights.'}
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="mt-6"
                    onClick={() => goTo('Architecture')}
                    disabled={!latestReview}
                  >
                    Review architecture <ArrowUpRight data-icon="inline-end" />
                  </Button>
                </div>
              </section>

              {/* Metric Cards */}
              <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  label="Open findings"
                  value={latestReview ? latestReview.findings.length : '—'}
                  subtext={latestReview ? `${findingsBySeverity.critical} critical, ${findingsBySeverity.high} high` : 'No analysis yet'}
                  icon={AlertCircle}
                  tone={latestReview && latestReview.findings.length > 0 ? 'warn' : 'default'}
                />
                <MetricCard
                  label="Architecture score"
                  value={latestReview ? (latestReview.categoryScores?.architecture ?? '100') : '—'}
                  subtext={latestReview?.architecture?.cycles.length ? `${latestReview.architecture.cycles.length} cycles detected` : 'No cycles detected'}
                  icon={Network}
                  tone={latestReview?.architecture?.cycles.length ? 'warn' : 'good'}
                />
                {(() => {
                  const linePct = latestReview?.coverage?.lines.percentage ?? latestReview?.categoryScores?.testing;
                  const hasCoverage = linePct != null;
                  const funcPct = latestReview?.coverage?.functions.percentage;
                  const branchPct = latestReview?.coverage?.branches.percentage;

                  let subtext = 'Coverage data unavailable';
                  if (hasCoverage) {
                    if (funcPct != null && branchPct != null) {
                      subtext = `${funcPct}% functions, ${branchPct}% branches`;
                    } else {
                      subtext = 'Lines covered';
                    }
                  } else if (!latestReview) {
                    subtext = 'No analysis yet';
                  }

                  return (
                    <MetricCard
                      label="Test coverage"
                      value={hasCoverage ? `${linePct}%` : 'Unavailable'}
                      subtext={subtext}
                      icon={TestTube2}
                      tone={hasCoverage && linePct >= 80 ? 'good' : hasCoverage ? 'warn' : 'default'}
                    />
                  );
                })()}
                <MetricCard
                  label="Dependencies"
                  value={latestReview ? (latestReview.dependencies?.length ?? 0) : '—'}
                  subtext={latestReview ? 'Direct & dev dependencies' : 'No analysis yet'}
                  icon={Layers3}
                  tone="good"
                />
              </section>

              {/* Recent Analyses & Severity Breakdown */}
              <section className="mt-5 grid gap-5 xl:grid-cols-[1.4fr_0.8fr]">
                <div className="rounded-2xl border bg-card">
                  <div className="flex items-center justify-between border-b px-5 py-4">
                    <div>
                      <h2 className="text-sm font-semibold">Recent analyses</h2>
                      <p className="mt-1 text-xs text-muted-foreground">Historical reviews across your workspace</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => goTo('Análises')}>
                      View all <ArrowUpRight data-icon="inline-end" />
                    </Button>
                  </div>
                  <div className="divide-y">
                    {allReviews.slice(0, 5).map((rev) => (
                      <div key={rev.id} className="flex items-center gap-3 px-5 py-4">
                        <div className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                          <Code2 className="size-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-sm font-medium">{rev.projectName ?? 'Project'}</p>
                            {rev.branch && (
                              <span className="hidden rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline">
                                {rev.branch}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            {new Date(rev.createdAt).toLocaleString('pt-BR')}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold">{rev.score}</p>
                          <p
                            className={`text-[10px] font-medium ${
                              rev.decision === 'approve' ? 'text-emerald-700' : 'text-amber-700'
                            }`}
                          >
                            {rev.decision.toUpperCase()}
                          </p>
                        </div>
                        <ChevronRight className="size-4 text-muted-foreground" />
                      </div>
                    ))}
                    {allReviews.length === 0 && (
                      <div className="p-8 text-center text-xs text-muted-foreground">
                        No historical data available yet.
                      </div>
                    )}
                  </div>
                </div>

                {/* Findings by severity */}
                <div className="rounded-2xl border bg-card">
                  <div className="border-b px-5 py-4">
                    <h2 className="text-sm font-semibold">Findings by severity</h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {currentFindings.length} open findings in active project
                    </p>
                  </div>
                  <div className="flex flex-col gap-5 p-5">
                    {[
                      { name: 'Critical', amount: findingsBySeverity.critical, color: 'bg-rose-500' },
                      { name: 'High', amount: findingsBySeverity.high, color: 'bg-orange-500' },
                      { name: 'Medium', amount: findingsBySeverity.medium, color: 'bg-amber-400' },
                      { name: 'Low', amount: findingsBySeverity.low, color: 'bg-sky-500' },
                    ].map(({ name, amount, color }) => (
                      <div key={name} className="flex items-center gap-3">
                        <span className={`size-2 rounded-full ${color}`} />
                        <span className="w-16 text-xs text-muted-foreground">{name}</span>
                        <div className="h-2 flex-1 rounded-full bg-muted">
                          <div
                            className={`h-2 rounded-full ${color}`}
                            style={{
                              width: `${currentFindings.length === 0 ? 0 : Math.max(4, (amount / currentFindings.length) * 100)}%`,
                            }}
                          />
                        </div>
                        <span className="w-5 text-right text-xs font-semibold">{amount}</span>
                      </div>
                    ))}
                    <div className="mt-1 rounded-xl bg-muted/60 p-3">
                      <div className="flex items-center gap-2 text-xs font-medium">
                        <ShieldCheck
                          className={`size-4 ${findingsBySeverity.critical === 0 ? 'text-emerald-600' : 'text-rose-600'}`}
                        />
                        {findingsBySeverity.critical === 0 ? 'No critical vulnerabilities' : `${findingsBySeverity.critical} critical issues`}
                      </div>
                      <p className="mt-1 pl-6 text-[11px] text-muted-foreground">
                        {latestReview?.gate?.passed ? 'Quality gate passing' : 'Action required on blockers'}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => goTo('Findings')}>
                      Explore findings <ArrowUpRight data-icon="inline-end" />
                    </Button>
                  </div>
                </div>
              </section>

              {/* Latest findings table */}
              <section className="mt-5 rounded-2xl border bg-card">
                <div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-sm font-semibold">Latest findings</h2>
                    <p className="mt-1 text-xs text-muted-foreground">Real rule detections from active analysis</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => goTo('Findings')}>
                      View all ({currentFindings.length}) <ArrowUpRight data-icon="inline-end" />
                    </Button>
                  </div>
                </div>
                <div className="divide-y">
                  {visibleFindings.slice(0, 6).map((finding) => (
                    <div key={finding.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                      <div
                        className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${
                          finding.severity === 'critical' || finding.severity === 'high'
                            ? 'bg-orange-100 text-orange-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        <AlertTriangle className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                            {finding.ruleId ?? 'RULE'}
                          </span>
                          <span className="text-sm font-medium">{finding.title}</span>
                        </div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">{finding.description}</p>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground sm:w-[260px]">
                        <span className="truncate font-mono">
                          {finding.file}{finding.line ? `:${finding.line}` : ''}
                        </span>
                        <span className="whitespace-nowrap rounded-full border px-2 py-1 text-[10px] uppercase">
                          {finding.status}
                        </span>
                      </div>
                    </div>
                  ))}
                  {visibleFindings.length === 0 && (
                    <div className="p-8 text-center text-sm text-muted-foreground">
                      {latestReview ? 'No findings found matching criteria.' : 'No findings available yet. Run your first analysis.'}
                    </div>
                  )}
                </div>
              </section>
            </>
          )}

          {/* TAB 2: PROJETOS */}
          {active === 'Projetos' && (
            <section className="rounded-2xl border bg-card">
              <div className="flex items-center justify-between border-b p-5">
                <div>
                  <h2 className="text-lg font-semibold">Registered projects</h2>
                  <p className="text-xs text-muted-foreground">Manage connected repositories and governance boundaries</p>
                </div>
                <Button size="sm" onClick={() => setNewProjectModalOpen(true)}>
                  <Plus className="size-3.5" /> Add Project
                </Button>
              </div>
              <div className="divide-y">
                {projects.map((proj) => (
                  <div key={proj.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-base font-semibold">{proj.name}</p>
                        <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                          {proj.branch ?? 'main'}
                        </span>
                        {selectedProjectId === proj.id && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">{proj.repository}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Created {new Date(proj.createdAt).toLocaleDateString('pt-BR')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant={selectedProjectId === proj.id ? 'secondary' : 'outline'}
                        size="sm"
                        onClick={() => {
                          setSelectedProjectId(proj.id)
                          loadProjectDetails(proj.id)
                        }}
                      >
                        {selectedProjectId === proj.id ? 'Selected' : 'Select'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10"
                        onClick={() => handleDeleteProject(proj.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {projects.length === 0 && (
                  <div className="p-12 text-center">
                    <Box className="mx-auto size-8 text-muted-foreground" />
                    <p className="mt-2 text-sm font-semibold">No projects yet</p>
                    <p className="mt-1 text-xs text-muted-foreground">Add a repository to begin monitoring software quality.</p>
                    <Button size="sm" className="mt-4" onClick={() => setNewProjectModalOpen(true)}>
                      Add your first project
                    </Button>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* TAB 3: ANÁLISES */}
          {active === 'Análises' && (
            <section className="rounded-2xl border bg-card">
              <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between border-b">
                <div>
                  <h2 className="text-lg font-semibold">Analysis history</h2>
                  <p className="text-xs text-muted-foreground">Complete record of automated reviews and quality gates</p>
                </div>
                {allReviews.length > 1 && (
                  <Button
                    onClick={() => goTo('Comparação')}
                    variant="outline"
                    className="flex items-center gap-2 text-xs"
                  >
                    <GitCompare className="size-3.5" />
                    <span>Compare Releases</span>
                  </Button>
                )}
              </div>
              <div className="divide-y">
                {allReviews.map((rev) => (
                  <div key={rev.id} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{rev.projectName ?? 'Project'}</span>
                        <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs">{rev.branch ?? 'main'}</span>
                        {rev.commitSha && (
                          <span className="font-mono text-xs text-muted-foreground">
                            sha:{rev.commitSha.slice(0, 7)}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {rev.analyzedFiles} files analyzed &bull; {rev.findings.length} findings &bull;{' '}
                        {new Date(rev.createdAt).toLocaleString('pt-BR')}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <span className="text-xl font-bold">{rev.score}/100</span>
                        <p
                          className={`text-[10px] font-semibold ${
                            rev.decision === 'approve' ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          {rev.decision.toUpperCase()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
                {allReviews.length === 0 && (
                  <div className="p-12 text-center text-xs text-muted-foreground">
                    No analyses recorded yet. Run your first analysis from the dashboard.
                  </div>
                )}
              </div>
            </section>
          )}

          {/* TAB 3.5: COMPARAÇÃO (MULTI-BRANCH & DRIFT) */}
          {active === 'Comparação' && (
            <ReviewComparisonView
              projectId={activeProject?.id ?? ''}
              projectName={activeProject?.name ?? 'Project'}
              reviews={allReviews}
            />
          )}

          {/* TAB 4: FINDINGS COMMAND CENTER */}
          {active === 'Findings' && (
            <FindingsCommandCenter
              project={activeProject}
              review={latestReview}
              isAnalyzing={isAnalyzing}
              analysisStatus={analysisStatus}
              onRunAnalysis={handleRunAnalysis}
              onViewArchitecture={() => goTo('Architecture')}
              onViewHistory={() => goTo('Análises')}
              onSignIn={() => setAuthModalOpen(true)}
              error={globalError}
              onRetry={loadInitialData}
            />
          )}

          {/* TAB 5: ARCHITECTURE */}
          {active === 'Architecture' && (
            <ArchitectureGovernance
              project={activeProject}
              architectureGraph={architectureGraph}
              findings={currentFindings}
              onRefresh={() => {
                if (activeProject) {
                  loadProjectDetails(activeProject.id)
                }
              }}
            />
          )}


          {/* TAB 6: SECURITY */}
          {active === 'Security' && (
            <section className="rounded-2xl border bg-card">
              <div className="border-b p-5">
                <h2 className="text-lg font-semibold">Security signals & hardcoded secrets</h2>
                <p className="text-xs text-muted-foreground">Static security detections and credential exposure alerts</p>
              </div>
              <div className="divide-y">
                {currentFindings
                  .filter((f) => f.category === 'security')
                  .map((finding) => (
                    <div key={finding.id} className="p-5">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-800 uppercase">
                          {finding.severity}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">{finding.ruleId}</span>
                        <span className="text-sm font-semibold">{finding.title}</span>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">{finding.description}</p>
                      <p className="mt-2 font-mono text-xs text-foreground">
                        {finding.file}:{finding.line}
                      </p>
                      <p className="mt-1 text-xs text-emerald-700">Remediation: {finding.suggestion}</p>
                    </div>
                  ))}
                {currentFindings.filter((f) => f.category === 'security').length === 0 && (
                  <div className="p-12 text-center text-xs text-muted-foreground">
                    No security issues detected in latest analysis.
                  </div>
                )}
              </div>
            </section>
          )}

          {/* TAB 7: DEPENDENCIES */}
          {active === 'Dependencies' && (
            <section className="rounded-2xl border bg-card">
              <div className="border-b p-5 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Project dependencies</h2>
                  <p className="text-xs text-muted-foreground">
                    Real multi-language dependencies extracted from manifests (package.json, requirements.txt, pyproject.toml, go.mod, pom.xml, Cargo.toml)
                  </p>
                </div>
                <span className="rounded-full bg-muted px-3 py-1 font-mono text-xs font-medium">
                  {(latestReview?.dependencies ?? dependenciesList).length} dependencies
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b bg-muted/30 text-muted-foreground">
                    <tr>
                      <th className="p-3">Ecosystem</th>
                      <th className="p-3">Dependency</th>
                      <th className="p-3">Version</th>
                      <th className="p-3">Manifest</th>
                      <th className="p-3">Type</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(latestReview?.dependencies ?? dependenciesList).map((dep, idx) => (
                      <tr key={`${dep.ecosystem ?? 'unknown'}:${dep.name}@${dep.version ?? '*'}-${idx}`}>
                        <td className="p-3">
                          <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${
                            dep.ecosystem === 'python' ? 'bg-amber-500/10 text-amber-500' :
                            dep.ecosystem === 'go' ? 'bg-cyan-500/10 text-cyan-500' :
                            dep.ecosystem === 'maven' ? 'bg-rose-500/10 text-rose-500' :
                            dep.ecosystem === 'cargo' ? 'bg-orange-500/10 text-orange-500' :
                            'bg-blue-500/10 text-blue-500'
                          }`}>
                            {dep.ecosystem ?? 'npm'}
                          </span>
                        </td>
                        <td className="p-3 font-mono font-medium">
                          {dep.name}
                          {dep.indirect && (
                            <span className="ml-2 rounded bg-muted/80 px-1.5 py-0.2 text-[9px] text-muted-foreground">indirect</span>
                          )}
                          {dep.optional && (
                            <span className="ml-2 rounded bg-muted/80 px-1.5 py-0.2 text-[9px] text-muted-foreground">optional</span>
                          )}
                        </td>
                        <td className="p-3 font-mono text-muted-foreground">{dep.version ?? '*'}</td>
                        <td className="p-3 font-mono text-muted-foreground text-[11px]">{dep.manifest ?? 'manifest'}</td>
                        <td className="p-3">
                          <span className="rounded bg-muted px-2 py-0.5 text-[10px] uppercase">{dep.type ?? 'dependency'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(latestReview?.dependencies ?? dependenciesList).length === 0 && (
                  <div className="p-12 text-center text-xs text-muted-foreground">
                    No dependencies detected.
                  </div>
                )}
              </div>
            </section>
          )}

          {/* TAB 8: QUALITY GATES */}
          {active === 'Quality Gates' && (
            <section className="rounded-2xl border bg-card p-5">
              <h2 className="text-lg font-semibold">Quality gate evaluation</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Policy enforcement rules before merging or deploying
              </p>
              {latestReview?.gate ? (
                <div className="mt-6 space-y-4">
                  <div className="flex items-center gap-3 rounded-xl border p-4">
                    <span
                      className={`size-3 rounded-full ${
                        latestReview.gate.passed ? 'bg-emerald-500' : 'bg-rose-500'
                      }`}
                    />
                    <div>
                      <p className="text-sm font-semibold">
                        {latestReview.gate.passed ? 'GATE PASSED' : 'GATE BLOCKED'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Decision: {latestReview.gate.decision.toUpperCase()} &bull; Minimum score required: 80
                      </p>
                    </div>
                  </div>
                  {latestReview.gate.reasons.length > 0 && (
                    <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4">
                      <p className="text-xs font-semibold text-destructive">Blocking reasons:</p>
                      <ul className="mt-2 list-inside list-disc text-xs text-destructive">
                        {latestReview.gate.reasons.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-6 p-8 text-center text-xs text-muted-foreground">
                  No quality gate evaluation available yet.
                </div>
              )}
            </section>
          )}

          {/* TAB 9: INTEGRAÇÕES */}
          {active === 'Integrações' && (
            <section className="rounded-2xl border bg-card p-5">
              <h2 className="text-lg font-semibold">GitHub & CI/CD Integrations</h2>
              <p className="mt-1 text-xs text-muted-foreground">Webhook configuration and GitHub PR automated check runs</p>

              <div className="mt-6 rounded-xl border p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <GitBranch className="size-6 text-foreground" />
                    <div>
                      <p className="text-sm font-semibold">GitHub App Integration</p>
                      <p className="text-xs text-muted-foreground">
                        {githubStatus?.configured
                          ? `Connected (App ID: ${githubStatus.appId})`
                          : 'GitHub App credentials are not configured in environment.'}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      githubStatus?.configured ? 'bg-emerald-100 text-emerald-800' : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {githubStatus?.configured ? 'Connected' : 'Not configured'}
                  </span>
                </div>
              </div>
            </section>
          )}

          {/* TAB: SETTINGS */}
          {active === 'Settings' && (
            <section className="space-y-4">
              <div className="rounded-2xl border bg-card p-5">
                <h2 className="text-lg font-semibold">Workspace Settings</h2>
                <p className="mt-1 text-xs text-muted-foreground">Manage organization profile, quality policies, and engine configuration</p>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border p-4">
                    <p className="text-xs font-medium text-muted-foreground">Organization Name</p>
                    <p className="mt-1 text-sm font-semibold">{organization?.name ?? 'Default Workspace'}</p>
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">ID: {organization?.id ?? '—'}</p>
                  </div>
                  <div className="rounded-xl border p-4">
                    <p className="text-xs font-medium text-muted-foreground">Active User</p>
                    <p className="mt-1 text-sm font-semibold">{user?.email ?? 'Not signed in'}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">Role: {user?.role ?? 'admin'}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border bg-card p-5">
                <h3 className="text-sm font-semibold">Default Quality Gate Policy</h3>
                <p className="mt-1 text-xs text-muted-foreground">Rules applied automatically across all project pull requests and branch analyses</p>
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="text-xs font-medium">Minimum Quality Score</p>
                      <p className="text-[11px] text-muted-foreground">Analyses below this threshold fail the quality gate</p>
                    </div>
                    <span className="rounded bg-muted px-2 py-1 font-mono text-xs font-bold">80 / 100</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="text-xs font-medium">Block on Critical & High Findings</p>
                      <p className="text-[11px] text-muted-foreground">Hardcoded secrets, SQL injections and severe architecture violations</p>
                    </div>
                    <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[10px] font-semibold text-rose-800">ENFORCED</span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border bg-card p-5">

                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold">Regras Arquiteturais Customizadas</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Configure barreiras modulares, regras de camadas e restrições de pacotes no módulo de Architecture.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => goTo('Architecture')}>
                    Configurar Regras <ArrowUpRight data-icon="inline-end" />
                  </Button>
                </div>
              </div>
            </section>
          )}

          {/* TAB 10: BILLING */}
          {active === 'Billing' && (
            <section className="rounded-2xl border bg-card p-5">
              <h2 className="text-lg font-semibold">Subscription & Billing</h2>
              <p className="mt-1 text-xs text-muted-foreground">Current organization plan and usage limits</p>

              <div className="mt-6 space-y-4">
                <div className="rounded-xl border p-5">
                  <p className="text-xs text-muted-foreground">Current plan</p>
                  <p className="mt-1 text-2xl font-bold capitalize">{organization?.plan ?? 'Community'}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {billingSubscription?.configured
                      ? `Status: ${billingSubscription.subscriptionStatus ?? 'Active'}`
                      : 'Billing is not configured yet.'}
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* Footer */}
          <footer className="flex flex-col gap-3 py-7 text-[11px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              All systems operational
            </div>
            <div className="flex gap-4">
              <span>QualityGuard v0.4.2</span>
              <span>Docs</span>
              <span>Support</span>
            </div>
          </footer>
        </main>
      </div>

      {/* Modal: Add Project */}
      {newProjectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-xl">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-semibold">Add new project</h3>
              <button onClick={() => setNewProjectModalOpen(false)}>
                <X className="size-4" />
              </button>
            </div>
            <form onSubmit={handleCreateProject} className="mt-4 space-y-4">
              {projectCreateError && (
                <p className="rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">{projectCreateError}</p>
              )}
              <div>
                <label className="block text-xs font-medium text-muted-foreground">Project Name</label>
                <input
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="e.g. ai-memory"
                  className="mt-1 h-9 w-full rounded-lg border bg-background px-3 text-xs outline-none focus:border-primary"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground">
                  Repository (GitHub owner/repo or URL)
                </label>
                <input
                  value={newProjectRepo}
                  onChange={(e) => setNewProjectRepo(e.target.value)}
                  placeholder="e.g. akitaonrails/ai-memory"
                  className="mt-1 h-9 w-full rounded-lg border bg-background px-3 text-xs outline-none focus:border-primary"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground">Branch</label>
                <input
                  value={newProjectBranch}
                  onChange={(e) => setNewProjectBranch(e.target.value)}
                  placeholder="e.g. release/2.2"
                  className="mt-1 h-9 w-full rounded-lg border bg-background px-3 text-xs outline-none focus:border-primary"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setNewProjectModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={projectCreateLoading}>
                  {projectCreateLoading ? 'Creating...' : 'Create project'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Authentication */}
      {authModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-2xl">
            <div className="flex items-center gap-2">
              <Logo />
            </div>
            <h3 className="mt-4 text-lg font-semibold">
              {authMode === 'register' ? 'Create QualityGuard account' : 'Sign in to QualityGuard'}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {authMode === 'register'
                ? 'Sign up to manage and govern code quality'
                : 'Enter your credentials to access your workspace'}
            </p>

            <form onSubmit={handleAuthSubmit} className="mt-5 space-y-3">
              {authError && (
                <p className="rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">{authError}</p>
              )}
              {authMode === 'register' && (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground">Organization name</label>
                  <input
                    value={authOrgName}
                    onChange={(e) => setAuthOrgName(e.target.value)}
                    placeholder="e.g. Acme Corp"
                    className="mt-1 h-9 w-full rounded-lg border bg-background px-3 text-xs outline-none focus:border-primary"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-muted-foreground">Email</label>
                <input
                  type="email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="developer@qualityguard.dev"
                  className="mt-1 h-9 w-full rounded-lg border bg-background px-3 text-xs outline-none focus:border-primary"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground">Password (8+ chars)</label>
                <input
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="mt-1 h-9 w-full rounded-lg border bg-background px-3 text-xs outline-none focus:border-primary"
                  required
                />
              </div>

              <Button type="submit" className="mt-2 w-full" disabled={authLoading}>
                {authLoading ? 'Authenticating...' : authMode === 'register' ? 'Create account' : 'Sign in'}
              </Button>

              <div className="pt-2 text-center text-xs">
                {authMode === 'register' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('login')
                      setAuthError(null)
                    }}
                    className="text-primary hover:underline"
                  >
                    Already have an account? Sign in
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('register')
                      setAuthError(null)
                    }}
                    className="text-primary hover:underline"
                  >
                    Need an account? Register
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
