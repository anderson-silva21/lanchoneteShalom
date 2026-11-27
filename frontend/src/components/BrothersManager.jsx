import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Plus, Save, Search, UsersRound } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api } from '../services/api'
import { formatDate } from '../utils/formatters'

const blankBrother = {
  full_name: '', preferred_name: '', birth_date: '', phone: '', email: '', postal_code: '',
  address_street: '', address_number: '', address_complement: '', district: '', city: '', state: '',
  community_joined_on: '', status: 'active', community_status: ''
}
function localToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}
const blankFollowup = { occurred_on: localToday(), responsible_user_id: null, category: '', notes: '', next_on: '', status: 'completed', start_time: '', end_time: '', location: '' }

function hasPermission(user, permission) {
  if (user?.role === 'admin' || user?.roles?.includes('admin')) return true
  return user?.brother_permissions?.includes(permission) || false
}

function valueOrNull(value) {
  return value === '' ? null : value
}

function DateLabel({ value }) {
  return value ? formatDate(value) : '—'
}

export function BrothersManager({ user, hideSectionNavigation = false }) {
  const location = useLocation()
  const navigate = useNavigate()
  const canRead = hasPermission(user, 'brothers:read')
  const canCreate = hasPermission(user, 'brothers:create')
  const canUpdate = hasPermission(user, 'brothers:update')
  const canManageGroups = hasPermission(user, 'brothers:groups:manage')
  const canManageMinistries = hasPermission(user, 'brothers:ministries:manage')
  const canReadFollowups = hasPermission(user, 'brothers:followups:read')
  const canCreateFollowups = hasPermission(user, 'brothers:followups:create')
  const canUpdateFollowups = hasPermission(user, 'brothers:followups:update')
  const [section, setSection] = useState('people')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({ group_id: '', ministry_id: '', status: 'active', page: 1 })
  const [directory, setDirectory] = useState({ items: [], pagination: { page: 1, page_size: 25, total: 0, total_pages: 1 } })
  const [groups, setGroups] = useState([])
  const [ministries, setMinistries] = useState([])
  const [people, setPeople] = useState([])
  const [selected, setSelected] = useState(null)
  const [draft, setDraft] = useState(blankBrother)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(false)
  const [followups, setFollowups] = useState([])
  const [followupDraft, setFollowupDraft] = useState(blankFollowup)
  const [editingFollowupId, setEditingFollowupId] = useState(null)
  const [groupDraft, setGroupDraft] = useState({ name: '', description: '', responsible_brother_id: '', active: true })
  const [ministryDraft, setMinistryDraft] = useState({ name: '', description: '', responsible_brother_id: '', active: true })
  const [editingGroupId, setEditingGroupId] = useState(null)
  const [editingMinistryId, setEditingMinistryId] = useState(null)
  const [membershipDraft, setMembershipDraft] = useState({ group_id: '', ministry_id: '', function_title: '', started_on: localToday() })
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const loadingBrotherId = useRef(null)

  const visibleSections = useMemo(() => [
    ...(canRead || canCreate ? [{ key: 'people', label: 'Irmaos' }] : []),
    ...(canManageGroups ? [{ key: 'groups', label: 'Grupos de oracao' }] : []),
    ...(canManageMinistries ? [{ key: 'ministries', label: 'Servicos e ministerios' }] : [])
  ], [canCreate, canManageGroups, canManageMinistries, canRead])

  const loadGroups = useCallback(async () => {
    if (!canRead && !canManageGroups) return setGroups([])
    try { setGroups(await api.brotherGroups()) } catch (error) { setMessage(error.message) }
  }, [canManageGroups, canRead])

  const loadMinistries = useCallback(async () => {
    if (!canRead && !canManageMinistries) return setMinistries([])
    try { setMinistries(await api.brotherMinistries()) } catch (error) { setMessage(error.message) }
  }, [canManageMinistries, canRead])

  const loadPeople = useCallback(async () => {
    if (!canRead && !canManageGroups && !canManageMinistries) return setPeople([])
    try { setPeople(await api.brotherPeople()) } catch (error) { setMessage(error.message) }
  }, [canManageGroups, canManageMinistries, canRead])

  const loadDirectory = useCallback(async () => {
    if (!canRead) return
    try {
      setDirectory(await api.brothers({ ...filters, q: search }))
    } catch (error) { setMessage(error.message) }
  }, [canRead, filters, search])

  useEffect(() => {
    if (!visibleSections.some((item) => item.key === section)) setSection(visibleSections[0]?.key || 'people')
  }, [section, visibleSections])

  useEffect(() => { loadGroups(); loadMinistries(); loadPeople() }, [loadGroups, loadMinistries, loadPeople])
  useEffect(() => { loadDirectory() }, [loadDirectory])

  const openBrother = useCallback(async (id) => {
    setBusy(true); setMessage('')
    try {
      const profile = await api.brother(id)
      navigate(`/gestao-irmaos/${id}`)
      setSelected(profile); setDraft({ ...blankBrother, ...profile }); setCreating(false); setEditing(false)
      if (canReadFollowups) setFollowups(await api.brotherFollowups(id))
      else setFollowups([])
    } catch (error) { setMessage(error.message) }
    finally { setBusy(false) }
  }, [canReadFollowups, navigate])

  function startCreate() {
    setSelected(null); setFollowups([]); setDraft(blankBrother); setCreating(true); setEditing(true); setMessage('')
    navigate('/gestao-irmaos/novo')
  }

  const routeBrotherId = Number(location.pathname.match(/^\/gestao-irmaos\/(\d+)$/)?.[1] || 0)
  useEffect(() => {
    if (routeBrotherId && selected?.id !== routeBrotherId && loadingBrotherId.current !== routeBrotherId) {
      loadingBrotherId.current = routeBrotherId
      openBrother(routeBrotherId).finally(() => { loadingBrotherId.current = null })
    }
    if (location.pathname === '/gestao-irmaos/novo' && !creating) {
      setSelected(null); setDraft(blankBrother); setCreating(true); setEditing(true)
    }
    if (location.pathname === '/gestao-irmaos' && (selected?.id || creating)) {
      setSelected(null); setCreating(false); setEditing(false)
    }
  }, [creating, location.pathname, openBrother, routeBrotherId, selected?.id])

  async function saveBrother(event) {
    event.preventDefault(); setBusy(true); setMessage('')
    const payload = Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, valueOrNull(value)]))
    try {
      const saved = creating ? await api.createBrother(payload) : await api.updateBrother(selected.id, payload)
      if (!canRead) {
        setSelected(null); setDraft(blankBrother); setCreating(false); setEditing(false)
        navigate('/gestao-irmaos')
        setMessage(creating ? 'Cadastro criado.' : 'Cadastro atualizado.')
        return
      }
      navigate(`/gestao-irmaos/${saved.id}`)
      setSelected(saved); setDraft({ ...blankBrother, ...saved }); setCreating(false); setEditing(false)
      setMessage(creating ? 'Cadastro criado.' : 'Cadastro atualizado.')
      await loadDirectory()
    } catch (error) { setMessage(error.message) }
    finally { setBusy(false) }
  }

  async function saveMembership(type) {
    if (!selected) return
    setBusy(true); setMessage('')
    try {
      if (type === 'group') await api.addBrotherGroup(selected.id, { group_id: Number(membershipDraft.group_id), started_on: membershipDraft.started_on })
      else await api.addBrotherMinistry(selected.id, { ministry_id: Number(membershipDraft.ministry_id), function_title: membershipDraft.function_title, started_on: membershipDraft.started_on })
      await openBrother(selected.id); await loadDirectory(); setMessage('Vinculo comunitario registrado.')
    } catch (error) { setMessage(error.message) }
    finally { setBusy(false) }
  }

  async function endMembership(type, item) {
    const ended_on = window.prompt('Data de encerramento (AAAA-MM-DD)', localToday())
    if (!ended_on) return
    setBusy(true); setMessage('')
    try {
      if (type === 'group') await api.endBrotherGroup(selected.id, item.membership_id, ended_on)
      else await api.endBrotherMinistry(selected.id, item.membership_id, ended_on)
      await openBrother(selected.id); await loadDirectory(); setMessage('Vinculo encerrado; o historico foi preservado.')
    } catch (error) { setMessage(error.message) }
    finally { setBusy(false) }
  }

  async function saveFollowup(event) {
    event.preventDefault(); setBusy(true); setMessage('')
    const payload = { ...followupDraft, next_on: valueOrNull(followupDraft.next_on), start_time: valueOrNull(followupDraft.start_time), end_time: valueOrNull(followupDraft.end_time), location: valueOrNull(followupDraft.location), responsible_user_id: followupDraft.responsible_user_id || null }
    try {
      if (editingFollowupId) await api.updateBrotherFollowup(selected.id, editingFollowupId, payload)
      else await api.createBrotherFollowup(selected.id, payload)
      setFollowupDraft(blankFollowup); setEditingFollowupId(null)
      if (canReadFollowups) setFollowups(await api.brotherFollowups(selected.id))
      setMessage(editingFollowupId ? 'Acompanhamento atualizado.' : 'Acompanhamento registrado.')
    } catch (error) { setMessage(error.message) }
    finally { setBusy(false) }
  }

  async function saveGroup(event) {
    event.preventDefault(); setBusy(true); setMessage('')
    const payload = { ...groupDraft, responsible_brother_id: groupDraft.responsible_brother_id ? Number(groupDraft.responsible_brother_id) : null }
    try {
      if (editingGroupId) await api.updateBrotherGroup(editingGroupId, payload)
      else await api.createBrotherGroup(payload)
      setGroupDraft({ name: '', description: '', responsible_brother_id: '', active: true }); setEditingGroupId(null)
      await loadGroups(); setMessage('Grupo salvo.')
    } catch (error) { setMessage(error.message) }
    finally { setBusy(false) }
  }

  async function saveMinistry(event) {
    event.preventDefault(); setBusy(true); setMessage('')
    const payload = { ...ministryDraft, responsible_brother_id: ministryDraft.responsible_brother_id ? Number(ministryDraft.responsible_brother_id) : null }
    try {
      if (editingMinistryId) await api.updateBrotherMinistry(editingMinistryId, payload)
      else await api.createBrotherMinistry(payload)
      setMinistryDraft({ name: '', description: '', responsible_brother_id: '', active: true }); setEditingMinistryId(null)
      await loadMinistries(); setMessage('Servico salvo.')
    } catch (error) { setMessage(error.message) }
    finally { setBusy(false) }
  }

  function beginEditFollowup(item) {
    setEditingFollowupId(item.id)
    setFollowupDraft({ occurred_on: item.occurred_on, responsible_user_id: item.responsible_user_id, category: item.category, notes: item.notes, next_on: item.next_on || '', status: item.status })
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-5 pb-6">
      <header className="flex flex-wrap items-center gap-3 border-b border-line/80 pb-4 dark:border-shalom-gold/10">
        {selected || creating ? <button type="button" className="mission-btn inline-flex min-h-11 items-center gap-2 px-3" onClick={() => navigate('/gestao-irmaos')}><ArrowLeft size={17} /> Voltar</button> : null}
        <div className="min-w-0 flex-1"><h2 className="font-display text-xl font-semibold">{selected?.preferred_name || selected?.full_name || (creating ? 'Novo cadastro' : 'Gestao de Irmaos')}</h2><p className="mission-muted mt-1 text-sm">Cadastros comunitarios com acesso individualizado.</p></div>
        {!selected && !creating && canCreate && section === 'people' ? <button type="button" className="mission-btn mission-btn-primary inline-flex min-h-11 items-center gap-2 px-4 font-semibold" onClick={startCreate}><Plus size={17} /> Novo irmao</button> : null}
      </header>

      {!hideSectionNavigation && !selected && !creating && visibleSections.length > 1 ? <nav className="scrollbar-hidden flex gap-5 overflow-x-auto border-b border-line/80 dark:border-shalom-gold/10" aria-label="Areas da Gestao de Irmaos">
        {visibleSections.map((item) => <button key={item.key} type="button" className={`section-text-tab shrink-0 ${section === item.key ? 'section-text-tab-active' : ''}`} onClick={() => setSection(item.key)}>{item.label}</button>)}
      </nav> : null}
      {message ? <p role="status" className="border-l-2 border-shalom-orange px-3 py-2 text-sm">{message}</p> : null}

      {section === 'people' && !selected && !creating ? <>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="relative sm:col-span-2"><span className="sr-only">Pesquisar irmao</span><Search size={17} className="pointer-events-none absolute left-3 top-1/2 mission-muted" /><input className="mission-input h-11 w-full pl-9 pr-3" placeholder="Pesquisar por nome" value={search} onChange={(event) => { setSearch(event.target.value); setFilters((current) => ({ ...current, page: 1 })) }} /></label>
          <select aria-label="Filtrar grupo de oracao" className="mission-input h-11 px-3" value={filters.group_id} onChange={(event) => setFilters((current) => ({ ...current, group_id: event.target.value, page: 1 }))}><option value="">Todos os grupos</option>{groups.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <select aria-label="Filtrar servico" className="mission-input h-11 px-3" value={filters.ministry_id} onChange={(event) => setFilters((current) => ({ ...current, ministry_id: event.target.value, page: 1 }))}><option value="">Todos os servicos</option>{ministries.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <select aria-label="Situacao cadastral" className="mission-input h-11 px-3" value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value, page: 1 }))}><option value="">Todas as situacoes</option><option value="active">Ativos</option><option value="inactive">Inativos</option></select>
        </div>
        <div className="divide-y divide-line/80 dark:divide-shalom-gold/10">
          {directory.items.map((item) => <button type="button" key={item.id} disabled={busy} onClick={() => openBrother(item.id)} className="flex min-h-16 w-full items-center gap-3 py-3 text-left hover:text-shalom-blue dark:hover:text-shalom-gold"><UsersRound size={19} className="shrink-0" /><span className="min-w-0 flex-1"><strong className="block truncate">{item.preferred_name || item.full_name}</strong><span className="mission-muted mt-1 block truncate text-xs">Cadastro {item.status === 'active' ? 'ativo' : 'inativo'}</span></span><span className="mission-muted text-xs">Abrir perfil</span></button>)}
          {!directory.items.length ? <p className="mission-muted py-8 text-center text-sm">Nenhum irmao encontrado.</p> : null}
        </div>
        <div className="flex items-center justify-between"><span className="mission-muted text-xs">{directory.pagination.total} cadastros</span><div className="flex gap-2"><button type="button" className="mission-btn min-h-10 px-3" disabled={filters.page <= 1} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}>Anterior</button><span className="self-center text-sm">{directory.pagination.page}/{Math.max(directory.pagination.total_pages, 1)}</span><button type="button" className="mission-btn min-h-10 px-3" disabled={filters.page >= directory.pagination.total_pages} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}>Proxima</button></div></div>
      </> : null}

      {(selected || creating) && editing ? <form onSubmit={saveBrother} className="grid gap-5">
        <section className="grid gap-3 border-b border-line/80 pb-5 dark:border-shalom-gold/10 sm:grid-cols-2 lg:grid-cols-3">
          <h3 className="font-display text-lg font-semibold sm:col-span-2 lg:col-span-3">Dados pessoais</h3>
          <label className="text-sm font-medium">Nome completo<input required minLength={3} maxLength={160} className="mission-input mt-1 h-11 w-full px-3" value={draft.full_name} onChange={(event) => setDraft({ ...draft, full_name: event.target.value })} /></label>
          <label className="text-sm font-medium">Nome de preferencia<input maxLength={100} className="mission-input mt-1 h-11 w-full px-3" value={draft.preferred_name || ''} onChange={(event) => setDraft({ ...draft, preferred_name: event.target.value })} /></label>
          <label className="text-sm font-medium">Data de nascimento<input type="date" className="mission-input mt-1 h-11 w-full px-3" value={draft.birth_date || ''} onChange={(event) => setDraft({ ...draft, birth_date: event.target.value })} /></label>
          <label className="text-sm font-medium">Telefone<input type="tel" maxLength={24} className="mission-input mt-1 h-11 w-full px-3" value={draft.phone || ''} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} /></label>
          <label className="text-sm font-medium">E-mail<input type="email" maxLength={254} className="mission-input mt-1 h-11 w-full px-3" value={draft.email || ''} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></label>
          <label className="text-sm font-medium">Ingresso na comunidade<input type="date" className="mission-input mt-1 h-11 w-full px-3" value={draft.community_joined_on || ''} onChange={(event) => setDraft({ ...draft, community_joined_on: event.target.value })} /></label>
          <h3 className="font-display text-lg font-semibold sm:col-span-2 lg:col-span-3">Endereco</h3>
          <label className="text-sm font-medium">CEP<input maxLength={12} className="mission-input mt-1 h-11 w-full px-3" value={draft.postal_code || ''} onChange={(event) => setDraft({ ...draft, postal_code: event.target.value })} /></label>
          <label className="text-sm font-medium sm:col-span-2">Logradouro<input maxLength={180} className="mission-input mt-1 h-11 w-full px-3" value={draft.address_street || ''} onChange={(event) => setDraft({ ...draft, address_street: event.target.value })} /></label>
          <label className="text-sm font-medium">Numero<input maxLength={30} className="mission-input mt-1 h-11 w-full px-3" value={draft.address_number || ''} onChange={(event) => setDraft({ ...draft, address_number: event.target.value })} /></label>
          <label className="text-sm font-medium">Complemento<input maxLength={100} className="mission-input mt-1 h-11 w-full px-3" value={draft.address_complement || ''} onChange={(event) => setDraft({ ...draft, address_complement: event.target.value })} /></label>
          <label className="text-sm font-medium">Bairro<input maxLength={100} className="mission-input mt-1 h-11 w-full px-3" value={draft.district || ''} onChange={(event) => setDraft({ ...draft, district: event.target.value })} /></label>
          <label className="text-sm font-medium">Cidade<input maxLength={100} className="mission-input mt-1 h-11 w-full px-3" value={draft.city || ''} onChange={(event) => setDraft({ ...draft, city: event.target.value })} /></label>
          <label className="text-sm font-medium">Estado<input maxLength={2} className="mission-input mt-1 h-11 w-full px-3" value={draft.state || ''} onChange={(event) => setDraft({ ...draft, state: event.target.value.toUpperCase() })} /></label>
          <h3 className="font-display text-lg font-semibold sm:col-span-2 lg:col-span-3">Situacao</h3>
          <label className="text-sm font-medium">Cadastro<select className="mission-input mt-1 h-11 w-full px-3" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option value="active">Ativo</option><option value="inactive">Inativo</option></select></label>
          <label className="text-sm font-medium sm:col-span-2">Situacao na comunidade<input maxLength={100} className="mission-input mt-1 h-11 w-full px-3" value={draft.community_status || ''} onChange={(event) => setDraft({ ...draft, community_status: event.target.value })} /></label>
        </section>
        <div className="flex flex-wrap gap-2"><button type="submit" disabled={busy} className="mission-btn mission-btn-primary inline-flex min-h-11 items-center gap-2 px-4 font-semibold"><Save size={17} /> Salvar cadastro</button><button type="button" className="mission-btn min-h-11 px-4" onClick={() => { setEditing(false); if (creating) { setCreating(false); setDraft(blankBrother) } }}>Cancelar</button></div>
      </form> : null}

      {selected && !editing ? <div className="grid gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="mission-muted text-sm">{selected.status === 'active' ? 'Cadastro ativo' : 'Cadastro inativo'}{selected.community_status ? ` · ${selected.community_status}` : ''}</p>{canUpdate ? <button type="button" className="mission-btn min-h-11 px-4" onClick={() => setEditing(true)}>Editar cadastro</button> : null}</div>
        <section className="grid gap-3 border-b border-line/80 pb-5 dark:border-shalom-gold/10 sm:grid-cols-2 lg:grid-cols-3">
          <h3 className="font-display text-lg font-semibold sm:col-span-2 lg:col-span-3">Dados pessoais</h3>
          <p><span className="mission-muted block text-xs">Nome completo</span>{selected.full_name}</p><p><span className="mission-muted block text-xs">Nome de preferencia</span>{selected.preferred_name || '—'}</p><p><span className="mission-muted block text-xs">Nascimento</span><DateLabel value={selected.birth_date} /></p>
          <p><span className="mission-muted block text-xs">Telefone</span>{selected.phone || '—'}</p><p><span className="mission-muted block text-xs">E-mail</span>{selected.email || '—'}</p><p><span className="mission-muted block text-xs">Ingresso</span><DateLabel value={selected.community_joined_on} /></p>
          <p className="sm:col-span-2 lg:col-span-3"><span className="mission-muted block text-xs">Endereco</span>{[selected.address_street, selected.address_number, selected.address_complement, selected.district, selected.city, selected.state, selected.postal_code].filter(Boolean).join(', ') || '—'}</p>
        </section>
        <section className="grid gap-3 border-b border-line/80 pb-5 dark:border-shalom-gold/10">
          <h3 className="font-display text-lg font-semibold">Grupos de oracao</h3>
          {selected.groups.map((item) => <div key={item.membership_id} className="flex flex-wrap items-center gap-2 text-sm"><strong className="mr-auto">{item.name}</strong><span>{item.responsible_name ? `Responsavel: ${item.responsible_name} · ` : ''}<DateLabel value={item.started_on} /> – {item.ended_on ? <DateLabel value={item.ended_on} /> : 'atual'}</span>{canUpdate && !item.ended_on ? <button type="button" className="mission-btn min-h-9 px-2 text-xs" onClick={() => endMembership('group', item)}>Encerrar</button> : null}</div>)}
          {canUpdate ? <div className="grid gap-2 sm:grid-cols-[1fr_180px_auto]"><select aria-label="Grupo de oracao" className="mission-input h-11 px-3" value={membershipDraft.group_id} onChange={(event) => setMembershipDraft({ ...membershipDraft, group_id: event.target.value })}><option value="">Selecionar grupo</option>{groups.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><input aria-label="Inicio no grupo" type="date" className="mission-input h-11 px-3" value={membershipDraft.started_on} onChange={(event) => setMembershipDraft({ ...membershipDraft, started_on: event.target.value })} /><button type="button" className="mission-btn min-h-11 px-3" disabled={!membershipDraft.group_id || busy} onClick={() => saveMembership('group')}>Vincular grupo</button></div> : null}
        </section>
        <section className="grid gap-3 border-b border-line/80 pb-5 dark:border-shalom-gold/10">
          <h3 className="font-display text-lg font-semibold">Servicos e ministerios</h3>
          {selected.ministries.map((item) => <div key={item.membership_id} className="flex flex-wrap items-center gap-2 text-sm"><strong className="mr-auto">{item.name}{item.function_title ? ` · ${item.function_title}` : ''}</strong><span>{item.responsible_name ? `Responsavel: ${item.responsible_name} · ` : ''}<DateLabel value={item.started_on} /> – {item.ended_on ? <DateLabel value={item.ended_on} /> : 'atual'}</span>{canUpdate && !item.ended_on ? <button type="button" className="mission-btn min-h-9 px-2 text-xs" onClick={() => endMembership('ministry', item)}>Encerrar</button> : null}</div>)}
          {canUpdate ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_180px_auto]"><select aria-label="Servico" className="mission-input h-11 px-3" value={membershipDraft.ministry_id} onChange={(event) => setMembershipDraft({ ...membershipDraft, ministry_id: event.target.value })}><option value="">Selecionar servico</option>{ministries.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><input aria-label="Funcao desempenhada" maxLength={100} className="mission-input h-11 px-3" placeholder="Funcao" value={membershipDraft.function_title} onChange={(event) => setMembershipDraft({ ...membershipDraft, function_title: event.target.value })} /><input aria-label="Inicio no servico" type="date" className="mission-input h-11 px-3" value={membershipDraft.started_on} onChange={(event) => setMembershipDraft({ ...membershipDraft, started_on: event.target.value })} /><button type="button" className="mission-btn min-h-11 px-3" disabled={!membershipDraft.ministry_id || busy} onClick={() => saveMembership('ministry')}>Vincular servico</button></div> : null}
        </section>
        {canReadFollowups || canCreateFollowups ? <section className="grid gap-4 border-b border-line/80 pb-5 dark:border-shalom-gold/10">
          <h3 className="font-display text-lg font-semibold">Acompanhamentos</h3>
          {canReadFollowups ? <div className="divide-y divide-line/80 dark:divide-shalom-gold/10">{followups.map((item) => <article key={item.id} className="py-3"><div className="flex flex-wrap items-center gap-2"><strong className="mr-auto">{item.category}</strong><span className="text-xs"><DateLabel value={item.occurred_on} /> · {item.responsible_name} · {item.status}</span>{canUpdateFollowups ? <button type="button" className="mission-btn min-h-9 px-2 text-xs" onClick={() => beginEditFollowup(item)}>Editar</button> : null}</div><p className="mt-2 whitespace-pre-wrap text-sm">{item.notes}</p>{item.next_on ? <p className="mission-muted mt-2 text-xs">Proximo acompanhamento: <DateLabel value={item.next_on} /></p> : null}</article>)}</div> : <p className="mission-muted text-sm">Voce pode registrar acompanhamentos, mas nao consultar os registros anteriores.</p>}
          {canCreateFollowups || (canUpdateFollowups && editingFollowupId) ? <form onSubmit={saveFollowup} className="grid gap-3 rounded-lg border border-line/80 p-3 dark:border-shalom-gold/10 sm:grid-cols-2 lg:grid-cols-3"><h4 className="font-semibold sm:col-span-2 lg:col-span-3">{editingFollowupId ? 'Editar acompanhamento' : 'Novo acompanhamento'}</h4><label className="text-sm">Data<input required type="date" className="mission-input mt-1 h-11 w-full px-3" value={followupDraft.occurred_on} onChange={(event) => setFollowupDraft({ ...followupDraft, occurred_on: event.target.value })} /></label><label className="text-sm">Categoria<input required maxLength={80} className="mission-input mt-1 h-11 w-full px-3" value={followupDraft.category} onChange={(event) => setFollowupDraft({ ...followupDraft, category: event.target.value })} /></label><label className="text-sm">Situacao<select className="mission-input mt-1 h-11 w-full px-3" value={followupDraft.status} onChange={(event) => setFollowupDraft({ ...followupDraft, status: event.target.value })}><option value="completed">Realizado</option><option value="scheduled">Agendado</option><option value="cancelled">Cancelado</option></select></label><label className="text-sm sm:col-span-2 lg:col-span-3">Descricao e observacoes<textarea required maxLength={10000} className="mission-input mt-1 min-h-28 w-full px-3 py-2" value={followupDraft.notes} onChange={(event) => setFollowupDraft({ ...followupDraft, notes: event.target.value })} /></label><label className="text-sm">Proximo acompanhamento<input type="date" className="mission-input mt-1 h-11 w-full px-3" value={followupDraft.next_on} onChange={(event) => setFollowupDraft({ ...followupDraft, next_on: event.target.value })} /></label><button type="submit" disabled={busy} className="mission-btn mission-btn-primary min-h-11 self-end px-4">{editingFollowupId ? 'Salvar alteracoes' : 'Registrar acompanhamento'}</button></form> : null}
        </section> : null}
        <section className="grid gap-2"><h3 className="font-display text-lg font-semibold">Historico comunitario</h3>{selected.history.map((item) => <article key={item.id} className="border-b border-line/70 py-2 text-sm dark:border-shalom-gold/10"><p>{item.summary}</p><span className="mission-muted text-xs">{formatDate(item.created_at)} · {item.actor_name || 'Sistema'}</span></article>)}</section>
      </div> : null}

      {section === 'groups' && canManageGroups && !selected && !creating ? <section className="grid gap-4">
        <form onSubmit={saveGroup} className="grid gap-3 border-b border-line/80 pb-5 dark:border-shalom-gold/10 sm:grid-cols-2"><h3 className="font-display text-lg font-semibold sm:col-span-2">{editingGroupId ? 'Editar grupo' : 'Novo grupo de oracao'}</h3><label className="text-sm">Nome<input required maxLength={120} className="mission-input mt-1 h-11 w-full px-3" value={groupDraft.name} onChange={(event) => setGroupDraft({ ...groupDraft, name: event.target.value })} /></label><label className="text-sm">Responsavel<select required className="mission-input mt-1 h-11 w-full px-3" value={groupDraft.responsible_brother_id} onChange={(event) => setGroupDraft({ ...groupDraft, responsible_brother_id: event.target.value })}><option value="">Selecionar responsavel</option>{people.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></label><label className="text-sm sm:col-span-2">Descricao<textarea maxLength={500} className="mission-input mt-1 min-h-20 w-full px-3 py-2" value={groupDraft.description || ''} onChange={(event) => setGroupDraft({ ...groupDraft, description: event.target.value })} /></label><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={groupDraft.active} onChange={(event) => setGroupDraft({ ...groupDraft, active: event.target.checked })} /> Ativo</label><button type="submit" disabled={busy} className="mission-btn mission-btn-primary min-h-11 px-4">Salvar grupo</button></form>
        {groups.map((item) => <article key={item.id} className="flex flex-wrap items-center gap-3 border-b border-line/80 py-3 dark:border-shalom-gold/10"><span className="min-w-0 flex-1"><strong>{item.name}</strong><span className="mission-muted block text-xs">{item.responsible_name || 'Sem responsavel'} · {item.member_count} membros · {item.active ? 'Ativo' : 'Inativo'}</span></span><button type="button" className="mission-btn min-h-10 px-3" onClick={() => { setEditingGroupId(item.id); setGroupDraft({ name: item.name, description: item.description || '', responsible_brother_id: item.responsible_brother_id || '', active: item.active }) }}>Editar</button></article>)}
      </section> : null}

      {section === 'ministries' && canManageMinistries && !selected && !creating ? <section className="grid gap-4">
        <form onSubmit={saveMinistry} className="grid gap-3 border-b border-line/80 pb-5 dark:border-shalom-gold/10 sm:grid-cols-2"><h3 className="font-display text-lg font-semibold sm:col-span-2">{editingMinistryId ? 'Editar servico' : 'Novo servico ou ministerio'}</h3><label className="text-sm">Nome<input required maxLength={120} className="mission-input mt-1 h-11 w-full px-3" value={ministryDraft.name} onChange={(event) => setMinistryDraft({ ...ministryDraft, name: event.target.value })} /></label><label className="text-sm">Responsavel<select required className="mission-input mt-1 h-11 w-full px-3" value={ministryDraft.responsible_brother_id} onChange={(event) => setMinistryDraft({ ...ministryDraft, responsible_brother_id: event.target.value })}><option value="">Selecionar responsavel</option>{people.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></label><label className="text-sm sm:col-span-2">Descricao<textarea maxLength={500} className="mission-input mt-1 min-h-20 w-full px-3 py-2" value={ministryDraft.description || ''} onChange={(event) => setMinistryDraft({ ...ministryDraft, description: event.target.value })} /></label><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={ministryDraft.active} onChange={(event) => setMinistryDraft({ ...ministryDraft, active: event.target.checked })} /> Ativo</label><button type="submit" disabled={busy} className="mission-btn mission-btn-primary min-h-11 px-4">Salvar servico</button></form>
        {ministries.map((item) => <article key={item.id} className="flex flex-wrap items-center gap-3 border-b border-line/80 py-3 dark:border-shalom-gold/10"><span className="min-w-0 flex-1"><strong>{item.name}</strong><span className="mission-muted block text-xs">{item.responsible_name || 'Sem responsavel'} · {item.member_count} membros · {item.active ? 'Ativo' : 'Inativo'}</span></span><button type="button" className="mission-btn min-h-10 px-3" onClick={() => { setEditingMinistryId(item.id); setMinistryDraft({ name: item.name, description: item.description || '', responsible_brother_id: item.responsible_brother_id || '', active: item.active }) }}>Editar</button></article>)}
      </section> : null}
    </div>
  )
}
