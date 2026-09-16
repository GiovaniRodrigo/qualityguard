'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  ShieldCheck,
  AlertTriangle,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  Network,
  Sliders,
  Layers,
  ArrowRight,
  RefreshCw,
  Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  listArchitectureRules,
  createArchitectureRule,
  updateArchitectureRule,
  deleteArchitectureRule,
  type ArchitectureGraph,
  type ArchitectureRule,
  type ArchitectureRuleType,
  type Finding,
  type Project,
  type Severity,
} from '@/lib/api'

interface ArchitectureGovernanceProps {
  project: Project | null
  architectureGraph: ArchitectureGraph | null
  findings: Finding[]
  onRefresh?: () => void
}

export function ArchitectureGovernance({
  project,
  architectureGraph,
  findings,
  onRefresh,
}: ArchitectureGovernanceProps) {
  const [rules, setRules] = useState<ArchitectureRule[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [savingRule, setSavingRule] = useState(false)
  const [ruleName, setRuleName] = useState('')
  const [ruleType, setRuleType] = useState<ArchitectureRuleType>('forbidden_dependency')
  const [ruleSeverity, setRuleSeverity] = useState<Severity>('high')
  const [formError, setFormError] = useState<string | null>(null)

  // Config inputs
  const [cfgFrom, setCfgFrom] = useState('')
  const [cfgTo, setCfgTo] = useState('')
  const [cfgOnly, setCfgOnly] = useState('')
  const [cfgFromPattern, setCfgFromPattern] = useState('')
  const [cfgToPattern, setCfgToPattern] = useState('')
  const [cfgLayers, setCfgLayers] = useState('')
  const [cfgStrictAdjacent, setCfgStrictAdjacent] = useState(false)

  const loadRules = useCallback(async () => {
    if (!project) return
    setLoading(true)
    setError(null)
    try {
      const data = await listArchitectureRules(project.id)
      setRules(data)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [project])

  useEffect(() => {
    loadRules()
  }, [loadRules])

  const handleToggleRule = async (rule: ArchitectureRule) => {
    if (!project) return
    try {
      const updated = await updateArchitectureRule(project.id, rule.id, {
        enabled: !rule.enabled,
      })
      setRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
      if (onRefresh) onRefresh()
    } catch (err) {
      alert(`Erro ao alterar regra: ${(err as Error).message}`)
    }
  }

  const handleDeleteRule = async (ruleId: string) => {
    if (!project) return
    if (!confirm('Deseja realmente remover esta regra arquitetural?')) return
    try {
      await deleteArchitectureRule(project.id, ruleId)
      setRules((prev) => prev.filter((r) => r.id !== ruleId))
      if (onRefresh) onRefresh()
    } catch (err) {
      alert(`Erro ao excluir regra: ${(err as Error).message}`)
    }
  }

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!project) return
    if (!ruleName.trim()) {
      setFormError('O nome da regra é obrigatório.')
      return
    }

    setSavingRule(true)
    setFormError(null)

    try {
      let config: Record<string, unknown> = {}

      if (ruleType === 'forbidden_dependency') {
        if (!cfgFrom.trim() || !cfgTo.trim()) {
          throw new Error('Preencha os campos Origem (from) e Destino proibido (to).')
        }
        const toList = cfgTo.split(',').map((s) => s.trim()).filter(Boolean)
        config = {
          from: cfgFrom.trim(),
          to: toList.length > 1 ? toList : cfgTo.trim(),
        }
      } else if (ruleType === 'allowed_dependency') {
        if (!cfgFrom.trim() || !cfgOnly.trim()) {
          throw new Error('Preencha os campos Origem (from) e Destinos permitidos (only).')
        }
        const onlyList = cfgOnly.split(',').map((s) => s.trim()).filter(Boolean)
        config = {
          from: cfgFrom.trim(),
          only: onlyList,
        }
      } else if (ruleType === 'forbidden_path_dependency') {
        if (!cfgFromPattern.trim() || !cfgToPattern.trim()) {
          throw new Error('Preencha os padrões de origem e destino.')
        }
        config = {
          fromPattern: cfgFromPattern.trim(),
          toPattern: cfgToPattern.trim(),
        }
      } else if (ruleType === 'no_cycles') {
        config = {}
      } else if (ruleType === 'required_layer') {
        if (!cfgLayers.trim()) {
          throw new Error('Preencha a hierarquia de camadas separadas por vírgula.')
        }
        const layerList = cfgLayers.split(',').map((s) => s.trim()).filter(Boolean)
        if (layerList.length < 2) {
          throw new Error('Defina pelo menos 2 camadas para validação de arquitetura em camadas.')
        }
        config = {
          layers: layerList,
          strictAdjacentOnly: cfgStrictAdjacent,
        }
      }

      const created = await createArchitectureRule(project.id, {
        name: ruleName.trim(),
        type: ruleType,
        severity: ruleSeverity,
        enabled: true,
        config,
      })

      setRules((prev) => [...prev, created])
      setIsModalOpen(false)
      // Reset form
      setRuleName('')
      setCfgFrom('')
      setCfgTo('')
      setCfgOnly('')
      setCfgFromPattern('')
      setCfgToPattern('')
      setCfgLayers('')
      setCfgStrictAdjacent(false)
      if (onRefresh) onRefresh()
    } catch (err) {
      setFormError((err as Error).message)
    } finally {
      setSavingRule(false)
    }
  }

  const architectureFindings = findings.filter((f) => f.category === 'architecture')
  const enabledRulesCount = rules.filter((r) => r.enabled).length

  return (
    <div className="space-y-6">
      {/* Top Header & Summary Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Regras Ativas</p>
            <Sliders className="size-4 text-primary" />
          </div>
          <p className="mt-2 text-2xl font-bold">
            {enabledRulesCount} <span className="text-xs font-normal text-muted-foreground">/ {rules.length} total</span>
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">Governança arquitetural ativa</p>
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Módulos & Arestas</p>
            <Network className="size-4 text-primary" />
          </div>
          <p className="mt-2 text-2xl font-bold">
            {architectureGraph?.nodes.length ?? 0}{' '}
            <span className="text-xs font-normal text-muted-foreground">
              ({architectureGraph?.edges.length ?? 0} conexões)
            </span>
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">Mapeamento estático AST</p>
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Violações de Regras</p>
            <AlertTriangle
              className={`size-4 ${architectureFindings.length > 0 ? 'text-amber-500' : 'text-emerald-500'}`}
            />
          </div>
          <p
            className={`mt-2 text-2xl font-bold ${
              architectureFindings.length > 0 ? 'text-amber-600' : 'text-emerald-600'
            }`}
          >
            {architectureFindings.length}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {architectureFindings.length === 0 ? 'Grafo 100% em conformidade' : 'Requer atenção do time'}
          </p>
        </div>

        <div className="rounded-2xl border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground">Ciclos Circulares</p>
            <ShieldCheck
              className={`size-4 ${
                (architectureGraph?.cycles.length ?? 0) > 0 ? 'text-rose-500' : 'text-emerald-500'
              }`}
            />
          </div>
          <p
            className={`mt-2 text-2xl font-bold ${
              (architectureGraph?.cycles.length ?? 0) > 0 ? 'text-rose-600' : 'text-emerald-600'
            }`}
          >
            {architectureGraph?.cycles.length ?? 0}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">Detecção de acoplamento circular</p>
        </div>
      </div>

      {/* Rules Management Section */}
      <div className="rounded-2xl border bg-card">
        <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Regras de Governança Arquitetural</h2>
            <p className="text-xs text-muted-foreground">
              Políticas determinísticas avaliadas em tempo real durante análises e Pull Requests
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadRules} disabled={loading || !project}>
              <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
            </Button>
            <Button size="sm" onClick={() => setIsModalOpen(true)} disabled={!project}>
              <Plus className="size-3.5" /> Nova Regra
            </Button>
          </div>
        </div>

        {error && (
          <div className="m-5 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </div>
        )}

        <div className="divide-y">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className={`flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between ${
                !rule.enabled ? 'opacity-60 bg-muted/20' : ''
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                      rule.severity === 'critical'
                        ? 'bg-rose-100 text-rose-800'
                        : rule.severity === 'high'
                        ? 'bg-orange-100 text-orange-800'
                        : rule.severity === 'medium'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-sky-100 text-sky-800'
                    }`}
                  >
                    {rule.severity}
                  </span>
                  <span className="rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                    {rule.type}
                  </span>
                  <h3 className="text-sm font-semibold">{rule.name}</h3>
                  {!rule.enabled && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      Desativada
                    </span>
                  )}
                </div>

                <div className="mt-2 text-xs font-mono text-muted-foreground">
                  {rule.type === 'forbidden_dependency' && (
                    <p>
                      Origem: <span className="text-foreground">{String(rule.config.from)}</span> ➔ Proibido:{' '}
                      <span className="text-foreground">
                        {Array.isArray(rule.config.to) ? rule.config.to.join(', ') : String(rule.config.to)}
                      </span>
                    </p>
                  )}
                  {rule.type === 'allowed_dependency' && (
                    <p>
                      Origem: <span className="text-foreground">{String(rule.config.from)}</span> ➔ Somente:{' '}
                      <span className="text-foreground">
                        {Array.isArray(rule.config.only) ? rule.config.only.join(', ') : String(rule.config.only)}
                      </span>
                    </p>
                  )}
                  {rule.type === 'forbidden_path_dependency' && (
                    <p>
                      De: <span className="text-foreground">{String(rule.config.fromPattern)}</span> ➔ Para:{' '}
                      <span className="text-foreground">{String(rule.config.toPattern)}</span>
                    </p>
                  )}
                  {rule.type === 'no_cycles' && <p>Ciclos circulares proibidos em qualquer profundidade do grafo.</p>}
                  {rule.type === 'required_layer' && (
                    <p>
                      Camadas:{' '}
                      <span className="text-foreground">
                        {Array.isArray(rule.config.layers) ? rule.config.layers.join(' ➔ ') : String(rule.config.layers)}
                      </span>{' '}
                      {rule.config.strictAdjacentOnly ? '(Adjacência estrita)' : ''}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant={rule.enabled ? 'outline' : 'secondary'}
                  size="sm"
                  onClick={() => handleToggleRule(rule)}
                >
                  {rule.enabled ? (
                    <>
                      <CheckCircle2 className="size-3.5 text-emerald-600" /> Ativa
                    </>
                  ) : (
                    <>
                      <XCircle className="size-3.5 text-muted-foreground" /> Inativa
                    </>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => handleDeleteRule(rule.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}

          {rules.length === 0 && !loading && (
            <div className="p-12 text-center">
              <Layers className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-2 text-sm font-semibold">Nenhuma regra arquitetural cadastrada</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Crie regras para impedir acoplamento indevido, violação de camadas ou ciclos no seu projeto.
              </p>
              <Button size="sm" className="mt-4" onClick={() => setIsModalOpen(true)} disabled={!project}>
                <Plus className="size-3.5" /> Adicionar primeira regra
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Architecture Rule Violations List */}
      {architectureFindings.length > 0 && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50/40 p-5 dark:bg-amber-950/20">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-amber-600 dark:text-amber-400" />
            <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              Violações Arquiteturais Detectadas ({architectureFindings.length})
            </h3>
          </div>
          <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
            As seguintes dependências violam as regras ativas de governança arquitetural:
          </p>

          <div className="mt-4 space-y-3">
            {architectureFindings.map((finding) => (
              <div key={finding.id} className="rounded-xl border bg-card p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                      finding.severity === 'critical'
                        ? 'bg-rose-100 text-rose-800'
                        : finding.severity === 'high'
                        ? 'bg-orange-100 text-orange-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {finding.severity}
                  </span>
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {finding.ruleId ?? 'custom/rule'}
                  </span>
                  <h4 className="text-sm font-semibold">{finding.title}</h4>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{finding.description}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-xs text-foreground">
                  <span className="rounded bg-muted px-2 py-0.5">{finding.file}</span>
                  {finding.suggestion && (
                    <span className="text-emerald-700 dark:text-emerald-400">
                      💡 {finding.suggestion}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detected Circular Cycles */}
      {architectureGraph && architectureGraph.cycles.length > 0 && (
        <div className="rounded-2xl border border-rose-300 bg-rose-50/40 p-5 dark:bg-rose-950/20">
          <h3 className="text-sm font-semibold text-rose-900 dark:text-rose-200">
            Ciclos de Dependência Circular ({architectureGraph.cycles.length})
          </h3>
          <p className="mt-1 text-xs text-rose-800 dark:text-rose-300">
            Estes módulos possuem referências cruzadas que formam ciclos:
          </p>
          <div className="mt-3 space-y-2">
            {architectureGraph.cycles.map((cycle, i) => (
              <div key={i} className="rounded-lg bg-background p-3 font-mono text-xs shadow-sm">
                {cycle.join(' ➔ ')}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: New Architecture Rule */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="w-full max-w-lg rounded-2xl border bg-card p-6 shadow-xl">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-semibold">Adicionar Regra Arquitetural</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                <XCircle className="size-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRule} className="mt-4 space-y-4">
              {formError && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                  {formError}
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-muted-foreground">Nome da Regra</label>
                <input
                  type="text"
                  placeholder="Ex: Proibir acesso UI -> Database"
                  value={ruleName}
                  onChange={(e) => setRuleName(e.target.value)}
                  className="mt-1.5 w-full rounded-lg border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Tipo de Regra</label>
                  <select
                    value={ruleType}
                    onChange={(e) => setRuleType(e.target.value as ArchitectureRuleType)}
                    className="mt-1.5 w-full rounded-lg border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="forbidden_dependency">forbidden_dependency</option>
                    <option value="allowed_dependency">allowed_dependency</option>
                    <option value="forbidden_path_dependency">forbidden_path_dependency</option>
                    <option value="no_cycles">no_cycles</option>
                    <option value="required_layer">required_layer</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">Severidade</label>
                  <select
                    value={ruleSeverity}
                    onChange={(e) => setRuleSeverity(e.target.value as Severity)}
                    className="mt-1.5 w-full rounded-lg border bg-background px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                    <option value="info">Info</option>
                  </select>
                </div>
              </div>

              {/* Dynamic Form based on Rule Type */}
              {ruleType === 'forbidden_dependency' && (
                <div className="space-y-3 rounded-xl bg-muted/40 p-3 text-xs">
                  <div>
                    <label className="font-medium">Módulo / Origem (from)</label>
                    <input
                      type="text"
                      placeholder="Ex: packages/ui/** ou src/components/**"
                      value={cfgFrom}
                      onChange={(e) => setCfgFrom(e.target.value)}
                      className="mt-1 w-full rounded border bg-background px-2.5 py-1.5 text-xs font-mono"
                      required
                    />
                  </div>
                  <div>
                    <label className="font-medium">Destino Proibido (to)</label>
                    <input
                      type="text"
                      placeholder="Ex: packages/database/** (ou múltiplos separados por vírgula)"
                      value={cfgTo}
                      onChange={(e) => setCfgTo(e.target.value)}
                      className="mt-1 w-full rounded border bg-background px-2.5 py-1.5 text-xs font-mono"
                      required
                    />
                  </div>
                </div>
              )}

              {ruleType === 'allowed_dependency' && (
                <div className="space-y-3 rounded-xl bg-muted/40 p-3 text-xs">
                  <div>
                    <label className="font-medium">Módulo / Origem (from)</label>
                    <input
                      type="text"
                      placeholder="Ex: apps/web/**"
                      value={cfgFrom}
                      onChange={(e) => setCfgFrom(e.target.value)}
                      className="mt-1 w-full rounded border bg-background px-2.5 py-1.5 text-xs font-mono"
                      required
                    />
                  </div>
                  <div>
                    <label className="font-medium">Apenas Destinos Permitidos (only)</label>
                    <input
                      type="text"
                      placeholder="Ex: packages/domain/**, packages/shared/**"
                      value={cfgOnly}
                      onChange={(e) => setCfgOnly(e.target.value)}
                      className="mt-1 w-full rounded border bg-background px-2.5 py-1.5 text-xs font-mono"
                      required
                    />
                  </div>
                </div>
              )}

              {ruleType === 'forbidden_path_dependency' && (
                <div className="space-y-3 rounded-xl bg-muted/40 p-3 text-xs">
                  <div>
                    <label className="font-medium">Padrão de Origem (fromPattern)</label>
                    <input
                      type="text"
                      placeholder="Ex: src/presentation/**"
                      value={cfgFromPattern}
                      onChange={(e) => setCfgFromPattern(e.target.value)}
                      className="mt-1 w-full rounded border bg-background px-2.5 py-1.5 text-xs font-mono"
                      required
                    />
                  </div>
                  <div>
                    <label className="font-medium">Padrão de Destino Proibido (toPattern)</label>
                    <input
                      type="text"
                      placeholder="Ex: src/infrastructure/**"
                      value={cfgToPattern}
                      onChange={(e) => setCfgToPattern(e.target.value)}
                      className="mt-1 w-full rounded border bg-background px-2.5 py-1.5 text-xs font-mono"
                      required
                    />
                  </div>
                </div>
              )}

              {ruleType === 'no_cycles' && (
                <div className="rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-2 font-medium text-foreground">
                    <Info className="size-4 text-primary" /> Verificação Global de Ciclos
                  </div>
                  <p className="mt-1">
                    Esta regra rejeitará automaticamente qualquer ciclo circular encontrado no grafo do projeto com a severidade selecionada.
                  </p>
                </div>
              )}

              {ruleType === 'required_layer' && (
                <div className="space-y-3 rounded-xl bg-muted/40 p-3 text-xs">
                  <div>
                    <label className="font-medium">Hierarquia de Camadas (Topo ➔ Base)</label>
                    <input
                      type="text"
                      placeholder="Ex: domain, application, infrastructure, presentation"
                      value={cfgLayers}
                      onChange={(e) => setCfgLayers(e.target.value)}
                      className="mt-1 w-full rounded border bg-background px-2.5 py-1.5 text-xs font-mono"
                      required
                    />
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Camadas superiores não podem depender diretamente de camadas inferiores.
                    </p>
                  </div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={cfgStrictAdjacent}
                      onChange={(e) => setCfgStrictAdjacent(e.target.checked)}
                      className="rounded border"
                    />
                    <span>Exigir adjacência estrita (strictAdjacentOnly)</span>
                  </label>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t">
                <Button type="button" variant="outline" size="sm" onClick={() => setIsModalOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" size="sm" disabled={savingRule}>
                  {savingRule ? 'Salvando...' : 'Criar Regra'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
