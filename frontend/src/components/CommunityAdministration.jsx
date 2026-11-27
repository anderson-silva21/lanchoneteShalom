import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, Plus, UsersRound } from 'lucide-react'
import { api } from '../services/api'
import { formatDateTime } from '../utils/formatters'

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const days = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const blankGroup = () => ({ name: '', description: '', responsible_brother_id: '', service_id: '', habitual_day_of_week: '', habitual_start_time: '', location: '', starts_on: today(), active: true })
const blankMinistry = () => ({ name: '', description: '', responsible_brother_id: '', active: true })
const field = 'mission-input mt-1 min-h-11 w-full px-3'

export function PrayerGroupsManager({ user, services, people }) {
  const canManage = user?.role === 'admin' || user?.roles?.includes('admin') || user?.brother_permissions?.includes('brothers:groups:manage')
  const [groups, setGroups] = useState([])
  const [allGroups, setAllGroups] = useState([])
  const [pastors, setPastors] = useState([])
  const [detail, setDetail] = useState(null)
  const [draft, setDraft] = useState(blankGroup)
  const [filters, setFilters] = useState({ q: '', service_id: '', responsible_brother_id: '', day_of_week: '', active: 'true' })
  const [membership, setMembership] = useState({ brother_id: '', started_on: today() })
  const [pastor, setPastor] = useState({ brother_id: '', started_on: today() })
  const [transferDraft,setTransferDraft]=useState({membership_id:'',group_id:'',started_on:today()})
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [editingId, setEditingId] = useState(null)

  const load = useCallback(async () => {
    try { setGroups(await api.filterBrotherGroups(filters)) } catch (error) { setMessage(error.message) }
  }, [filters])
  useEffect(() => { load() }, [load])
  useEffect(() => { api.brotherGroups().then(setAllGroups).catch(() => {}) }, [])
  useEffect(() => { api.pastoralPastors().then(setPastors).catch(() => {}) }, [])

  async function openGroup(id) {
    setMessage('')
    try { setDetail(await api.brotherGroup(id)) } catch (error) { setMessage(error.message) }
  }
  async function save(event) {
    event.preventDefault(); setBusy(true); setMessage('')
    const payload = { ...draft, responsible_brother_id: draft.responsible_brother_id || null, service_id: draft.service_id || null, habitual_day_of_week: draft.habitual_day_of_week === '' ? null : Number(draft.habitual_day_of_week), habitual_start_time:draft.habitual_start_time||null,starts_on: draft.starts_on || null }
    try {
      const saved = editingId ? await api.updateBrotherGroup(editingId, payload) : await api.createBrotherGroup(payload)
      setEditingId(null); setDraft(blankGroup()); await load(); await openGroup(saved.id)
      setMessage('Grupo de oração salvo. O encontro habitual também aparece no calendário.')
    } catch (error) { setMessage(error.message) } finally { setBusy(false) }
  }
  async function addMember(event) {
    event.preventDefault(); if (!detail) return
    setBusy(true); setMessage('')
    try { await api.addBrotherToGroup(detail.id, { ...membership, brother_id: Number(membership.brother_id) }); setMembership({ brother_id: '', started_on: today() }); await openGroup(detail.id); await load(); setMessage('Integrante adicionado.') } catch (error) { setMessage(error.message) } finally { setBusy(false) }
  }
  async function removeMember(member) {
    const ended_on = window.prompt('Data de encerramento (AAAA-MM-DD)', today())
    if (!ended_on) return
    try { await api.removeBrotherFromGroup(detail.id, member.membership_id, ended_on); await openGroup(detail.id); await load() } catch (error) { setMessage(error.message) }
  }
  function transferMember(member) { setTransferDraft({membership_id:member.membership_id,group_id:'',started_on:today()}) }
  async function submitTransfer(event) {
    event.preventDefault()
    try { await api.transferBrotherGroup(detail.id,Number(transferDraft.membership_id),{group_id:Number(transferDraft.group_id),started_on:transferDraft.started_on});setTransferDraft({membership_id:'',group_id:'',started_on:today()});await openGroup(detail.id);await load();setMessage('Transferência registrada; os dois vínculos foram preservados no histórico.') } catch(error) { setMessage(error.message) }
  }
  async function addPastor(event) {
    event.preventDefault(); if (!detail || !pastor.brother_id) return
    try { await api.addGroupPastor(detail.id, { ...pastor, brother_id: Number(pastor.brother_id) }); setPastor({ brother_id: '', started_on: today() }); await openGroup(detail.id) } catch (error) { setMessage(error.message) }
  }
  async function endPastor(link) {
    const ended_on = window.prompt('Data de encerramento (AAAA-MM-DD)', today())
    if (!ended_on) return
    try { await api.endGroupPastor(detail.id, link.link_id, ended_on); await openGroup(detail.id) } catch (error) { setMessage(error.message) }
  }

  return <div className="grid gap-4">
    <header><h2 className="font-display text-xl font-semibold">Grupos de oração</h2><p className="mission-muted mt-1 text-sm">Participação comunitária e vínculo pastoral são mantidos separadamente.</p></header>
    {message && <p role="status" className="border-l-2 border-shalom-orange px-3 py-2 text-sm">{message}</p>}
    {canManage && <details className="border-b border-line/80 pb-4 dark:border-shalom-gold/10" open={!groups.length}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-semibold"><Plus size={18}/>{editingId ? 'Editar grupo' : 'Cadastrar grupo'}</summary>
      <form onSubmit={save} className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm">Nome<input required maxLength={120} className={field} value={draft.name} onChange={(event)=>setDraft({...draft,name:event.target.value})}/></label>
        <label className="text-sm">Responsável<select className={field} value={draft.responsible_brother_id} onChange={(event)=>setDraft({...draft,responsible_brother_id:event.target.value})}><option value="">Selecionar responsável</option>{people.map((person)=><option key={person.id} value={person.id}>{person.preferred_name||person.full_name}</option>)}</select></label>
        <label className="text-sm">Serviço relacionado<select className={field} value={draft.service_id} onChange={(event)=>setDraft({...draft,service_id:event.target.value})}><option value="">Sem serviço relacionado</option>{services.filter((service)=>service.active).map((service)=><option key={service.id} value={service.id}>{service.name}</option>)}</select></label>
        <label className="text-sm">Dia habitual<select className={field} value={draft.habitual_day_of_week} onChange={(event)=>setDraft({...draft,habitual_day_of_week:event.target.value})}><option value="">Sem recorrência</option>{days.map((day,index)=><option value={index} key={day}>{day}</option>)}</select></label>
        <label className="text-sm">Horário habitual<input type="time" className={field} value={draft.habitual_start_time} onChange={(event)=>setDraft({...draft,habitual_start_time:event.target.value})}/></label>
        <label className="text-sm">Local<input maxLength={240} className={field} value={draft.location} onChange={(event)=>setDraft({...draft,location:event.target.value})}/></label>
        <label className="text-sm">Início do grupo<input required type="date" className={field} value={draft.starts_on} onChange={(event)=>setDraft({...draft,starts_on:event.target.value})}/></label>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={draft.active} onChange={(event)=>setDraft({...draft,active:event.target.checked})}/> Grupo ativo</label>
        <label className="text-sm sm:col-span-2">Descrição<textarea maxLength={1000} className="mission-input mt-1 min-h-20 w-full px-3 py-2" value={draft.description} onChange={(event)=>setDraft({...draft,description:event.target.value})}/></label>
        <div className="flex gap-2"><button disabled={busy} className="mission-btn mission-btn-primary min-h-11 px-4">Salvar grupo</button>{editingId&&<button type="button" className="mission-btn min-h-11 px-4" onClick={()=>{setEditingId(null);setDraft(blankGroup())}}>Cancelar edição</button>}</div>
      </form>
    </details>}
    <div className="grid gap-2 sm:grid-cols-2">
      <input aria-label="Buscar grupo" placeholder="Buscar grupo" className={field} value={filters.q} onChange={(event)=>setFilters({...filters,q:event.target.value})}/>
      <select aria-label="Filtrar serviço" className={field} value={filters.service_id} onChange={(event)=>setFilters({...filters,service_id:event.target.value})}><option value="">Todos os serviços</option>{services.map((service)=><option key={service.id} value={service.id}>{service.name}</option>)}</select>
      <select aria-label="Filtrar responsável" className={field} value={filters.responsible_brother_id} onChange={(event)=>setFilters({...filters,responsible_brother_id:event.target.value})}><option value="">Todos os responsáveis</option>{people.map((person)=><option key={person.id} value={person.id}>{person.preferred_name||person.full_name}</option>)}</select>
      <div className="grid grid-cols-2 gap-2"><select aria-label="Filtrar dia habitual" className={field} value={filters.day_of_week} onChange={(event)=>setFilters({...filters,day_of_week:event.target.value})}><option value="">Todos os dias</option>{days.map((day,index)=><option key={day} value={index}>{day}</option>)}</select><select aria-label="Filtrar situação" className={field} value={filters.active} onChange={(event)=>setFilters({...filters,active:event.target.value})}><option value="">Todas as situações</option><option value="true">Ativos</option><option value="false">Inativos</option></select></div>
    </div>
    <div className="divide-y divide-line/80 dark:divide-shalom-gold/10">{groups.map((group)=><div key={group.id} className="py-3">
      <div className="flex items-start gap-3"><UsersRound size={19} className="mt-1 shrink-0 text-shalom-blue dark:text-shalom-gold"/><div className="min-w-0 flex-1"><strong>{group.name}</strong><p className="mission-muted mt-1 text-xs">{group.responsible_name||'Sem responsável'}{group.service_name?` · ${group.service_name}`:''} · {group.member_count} integrantes · {group.active?'Ativo':'Inativo'}</p><p className="mission-muted mt-1 text-xs">{group.habitual_day_of_week!==null&&group.habitual_day_of_week!==undefined?`${days[group.habitual_day_of_week]}${group.habitual_start_time?` às ${group.habitual_start_time}`:''}`:'Sem encontro habitual'}{group.location?` · ${group.location}`:''}</p></div>{canManage&&<button aria-label={`Editar ${group.name}`} className="mission-btn min-h-10 px-3" onClick={()=>{setEditingId(group.id);setDraft({...blankGroup(),...group,habitual_day_of_week:group.habitual_day_of_week??'',habitual_start_time:group.habitual_start_time||'',service_id:group.service_id||'',responsible_brother_id:group.responsible_brother_id||''});window.scrollTo({top:0,behavior:'smooth'})}}>Editar</button>}</div>
      <button type="button" className="mt-2 min-h-10 pl-8 text-sm font-semibold text-shalom-blue dark:text-shalom-gold" onClick={()=>openGroup(group.id)}>{detail?.id===group.id?'Atualizar detalhes':'Participantes e histórico'} <ChevronDown size={15} className="inline"/></button>
      {detail?.id===group.id&&<div className="ml-8 mt-2 border-l border-line pl-3 dark:border-shalom-gold/15">
        <h3 className="text-sm font-semibold">Integrantes atuais</h3>{detail.members.filter((member)=>!member.ended_on).map((member)=><div key={member.membership_id} className="flex flex-wrap items-center gap-2 border-b border-line/60 py-2 text-sm dark:border-shalom-gold/10"><span className="mr-auto">{member.preferred_name||member.full_name}</span>{canManage&&<><button className="min-h-9 px-2 text-xs text-shalom-blue dark:text-shalom-gold" onClick={()=>transferMember(member)}>Transferir</button><button className="min-h-9 px-2 text-xs text-shalom-wine" onClick={()=>removeMember(member)}>Remover</button></>}</div>)}
        {canManage&&transferDraft.membership_id&&<form onSubmit={submitTransfer} className="grid gap-2 border-b border-line py-3 dark:border-shalom-gold/10 sm:grid-cols-[1fr_160px_auto]"><select required aria-label="Grupo de destino" className={field} value={transferDraft.group_id} onChange={(event)=>setTransferDraft({...transferDraft,group_id:event.target.value})}><option value="">Grupo de destino</option>{allGroups.filter((item)=>item.active&&item.id!==detail.id).map((item)=><option key={item.id} value={item.id}>{item.name}</option>)}</select><input required type="date" aria-label="Início no grupo de destino" className={field} value={transferDraft.started_on} onChange={(event)=>setTransferDraft({...transferDraft,started_on:event.target.value})}/><div className="flex gap-2"><button className="mission-btn mission-btn-primary min-h-11 px-3">Confirmar transferência</button><button type="button" className="mission-btn min-h-11 px-3" onClick={()=>setTransferDraft({membership_id:'',group_id:'',started_on:today()})}>Cancelar</button></div></form>}
        {canManage&&<form onSubmit={addMember} className="my-3 grid gap-2 sm:grid-cols-[1fr_160px_auto]"><select required aria-label="Novo integrante" className={field} value={membership.brother_id} onChange={(event)=>setMembership({...membership,brother_id:event.target.value})}><option value="">Adicionar integrante</option>{people.map((person)=><option key={person.id} value={person.id}>{person.preferred_name||person.full_name}</option>)}</select><input required type="date" aria-label="Data de início" className={field} value={membership.started_on} onChange={(event)=>setMembership({...membership,started_on:event.target.value})}/><button className="mission-btn min-h-11 px-3">Adicionar</button></form>}
        {canManage&&<form onSubmit={addPastor} className="my-3 grid gap-2 sm:grid-cols-[1fr_160px_auto]"><select required aria-label="Pastor vinculado" className={field} value={pastor.brother_id} onChange={(event)=>setPastor({...pastor,brother_id:event.target.value})}><option value="">Vincular pastor</option>{pastors.map((person)=><option key={person.id} value={person.id}>{person.preferred_name||person.full_name}</option>)}</select><input required type="date" aria-label="Data de vínculo pastoral" className={field} value={pastor.started_on} onChange={(event)=>setPastor({...pastor,started_on:event.target.value})}/><button className="mission-btn min-h-11 px-3">Vincular pastor</button></form>}
        {detail.pastors.filter((item)=>!item.ended_on).map((item)=><div key={item.link_id} className="flex items-center gap-2 py-1 text-sm"><span className="mr-auto">Pastor: {item.preferred_name||item.full_name}</span>{canManage&&<button className="min-h-9 px-2 text-xs" onClick={()=>endPastor(item)}>Encerrar vínculo</button>}</div>)}
        <h3 className="mt-3 text-sm font-semibold">Atividade recente</h3>{detail.history.slice(0,5).map((item)=><p key={item.id} className="mission-muted border-b border-line/50 py-1.5 text-xs">{item.summary} · {formatDateTime(item.created_at)}</p>)}
      </div>}
    </div>)}{!groups.length&&<p className="mission-muted py-8 text-center text-sm">Nenhum grupo encontrado.</p>}</div>
  </div>
}

function StructureNode({ node, servicesId, people, canManage, onRefresh }) {
  const [editing,setEditing]=useState(false)
  const [draft,setDraft]=useState({name:node.name,node_type:node.node_type,description:node.description||'',responsible_brother_id:node.responsible_brother_id||'',active:node.active})
  async function addMember(event) {
    event.preventDefault(); const data=new FormData(event.currentTarget)
    try { await api.addBrotherToMinistryNode(servicesId,node.id,{brother_id:Number(data.get('brother_id')),function_title:data.get('function_title')||null,started_on:data.get('started_on')}); await onRefresh() } catch (error) { window.alert(error.message) }
  }
  async function endMember(member) {
    const ended_on=window.prompt('Data de encerramento (AAAA-MM-DD)',today()); if(!ended_on)return
    try { await api.endBrotherMinistry(member.brother_id,member.id,ended_on); await onRefresh() } catch(error) { window.alert(error.message) }
  }
  async function saveNode(event){event.preventDefault();try{await api.updateMinistryNode(servicesId,node.id,{...draft,parent_node_id:node.parent_node_id||null,responsible_brother_id:draft.responsible_brother_id||null});setEditing(false);await onRefresh()}catch(error){window.alert(error.message)}}
  return <li className="ml-3 border-l border-line pl-3 dark:border-shalom-gold/15"><details open><summary className="min-h-11 cursor-pointer py-2"><strong>{node.name}</strong><span className="mission-muted ml-2 text-xs">{node.node_type==='coordination'?'Coordenação':node.node_type==='team'?'Equipe':'Nível personalizado'} · {node.member_count} integrantes{node.responsible_name?` · Responsável: ${node.responsible_preferred_name||node.responsible_name}`:''}</span></summary>
    <div className="divide-y divide-line/60 dark:divide-shalom-gold/10">{node.members.map((member)=><div key={member.id} className="flex items-center gap-2 py-2 text-sm"><span className="mr-auto">{member.preferred_name||member.full_name}{member.function_title?` · ${member.function_title}`:''}</span>{canManage&&<button className="min-h-9 px-2 text-xs" onClick={()=>endMember(member)}>Remover</button>}</div>)}</div>
    {canManage&&<button className="min-h-10 px-1 text-sm font-semibold text-shalom-blue dark:text-shalom-gold" onClick={()=>setEditing(!editing)}>{editing?'Fechar edição':'Editar nível'}</button>}
    {editing&&<form onSubmit={saveNode} className="grid gap-2 border-b border-line py-3 dark:border-shalom-gold/10 sm:grid-cols-2"><label className="text-sm">Nome<input required maxLength={120} className={field} value={draft.name} onChange={event=>setDraft({...draft,name:event.target.value})}/></label><label className="text-sm">Tipo<select className={field} value={draft.node_type} onChange={event=>setDraft({...draft,node_type:event.target.value})}><option value="coordination">Coordenação</option><option value="team">Equipe</option><option value="custom">Outro nível</option></select></label><label className="text-sm">Responsável<select className={field} value={draft.responsible_brother_id} onChange={event=>setDraft({...draft,responsible_brother_id:event.target.value})}><option value="">Sem responsável</option>{people.map(person=><option key={person.id} value={person.id}>{person.preferred_name||person.full_name}</option>)}</select></label><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={draft.active} onChange={event=>setDraft({...draft,active:event.target.checked})}/> Nível ativo</label><button className="mission-btn mission-btn-primary min-h-11 px-3">Salvar nível</button></form>}
    {canManage&&<form onSubmit={addMember} className="grid gap-2 py-3 sm:grid-cols-3"><select required name="brother_id" aria-label="Integrante" className={field}><option value="">Vincular irmão</option>{people.map((person)=><option key={person.id} value={person.id}>{person.preferred_name||person.full_name}</option>)}</select><input name="function_title" maxLength={100} placeholder="Função" aria-label="Função" className={field}/><div className="flex gap-2"><input required type="date" name="started_on" defaultValue={today()} aria-label="Data inicial" className={field}/><button className="mission-btn min-h-11 px-3">Adicionar</button></div></form>}
    {node.children.length>0&&<ul className="grid gap-1">{node.children.map((child)=><StructureNode key={child.id} node={child} servicesId={servicesId} people={people} canManage={canManage} onRefresh={onRefresh}/>)}</ul>}
  </details></li>
}

export function ServicesManager({ user, people }) {
  const canManage=user?.role==='admin'||user?.roles?.includes('admin')||user?.brother_permissions?.includes('brothers:ministries:manage')
  const [services,setServices]=useState([]); const [service,setService]=useState(null); const [draft,setDraft]=useState(blankMinistry); const [editingId,setEditingId]=useState(null); const [nodeDraft,setNodeDraft]=useState({parent_node_id:'',node_type:'coordination',name:'',description:'',responsible_brother_id:'',active:true}); const [message,setMessage]=useState('')
  const load=useCallback(async()=>{try{setServices(await api.brotherMinistries())}catch(error){setMessage(error.message)}},[])
  useEffect(()=>{load()},[load])
  async function loadStructure(id=service?.id){if(!id)return;try{setService(await api.ministryStructure(id))}catch(error){setMessage(error.message)}}
  async function saveService(event){event.preventDefault();try{const result=editingId?await api.updateBrotherMinistry(editingId,{...draft,responsible_brother_id:draft.responsible_brother_id||null}):await api.createBrotherMinistry({...draft,responsible_brother_id:draft.responsible_brother_id||null});setEditingId(null);setDraft(blankMinistry());await load();await loadStructure(result.id);setMessage('Serviço salvo.')}catch(error){setMessage(error.message)}}
  async function saveNode(event){event.preventDefault();if(!service)return;try{await api.createMinistryNode(service.id,{...nodeDraft,parent_node_id:nodeDraft.parent_node_id||null,responsible_brother_id:nodeDraft.responsible_brother_id||null});setNodeDraft({parent_node_id:'',node_type:'coordination',name:'',description:'',responsible_brother_id:'',active:true});await loadStructure();setMessage('Nível adicionado à estrutura.')}catch(error){setMessage(error.message)}}
  const flatNodes=useMemo(()=>{const values=[];const walk=(nodes,prefix='')=>nodes.forEach(node=>{values.push({id:node.id,name:`${prefix}${node.name}`});walk(node.children,`${prefix}— `)});walk(service?.nodes||[]);return values},[service])
  return <div className="grid gap-4">
    <header><h2 className="font-display text-xl font-semibold">Serviços e ministérios</h2><p className="mission-muted mt-1 text-sm">Cada serviço define seus próprios níveis de coordenação e equipes.</p></header>
    {message&&<p role="status" className="border-l-2 border-shalom-orange px-3 py-2 text-sm">{message}</p>}
    {canManage&&<details className="border-b border-line/80 pb-4 dark:border-shalom-gold/10"><summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-semibold"><Plus size={18}/>{editingId?'Editar serviço':'Cadastrar serviço'}</summary><form onSubmit={saveService} className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm">Nome<input required maxLength={120} className={field} value={draft.name} onChange={(event)=>setDraft({...draft,name:event.target.value})}/></label><label className="text-sm">Responsável<select className={field} value={draft.responsible_brother_id} onChange={(event)=>setDraft({...draft,responsible_brother_id:event.target.value})}><option value="">Selecionar responsável</option>{people.map(person=><option key={person.id} value={person.id}>{person.preferred_name||person.full_name}</option>)}</select></label><label className="text-sm sm:col-span-2">Descrição<textarea maxLength={1000} className="mission-input mt-1 min-h-20 w-full px-3 py-2" value={draft.description} onChange={(event)=>setDraft({...draft,description:event.target.value})}/></label><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={draft.active} onChange={(event)=>setDraft({...draft,active:event.target.checked})}/> Serviço ativo</label><button className="mission-btn mission-btn-primary min-h-11 px-4">Salvar serviço</button></form></details>}
    <div className="divide-y divide-line/80 dark:divide-shalom-gold/10">{services.map(item=><div key={item.id} className="py-3"><div className="flex items-start gap-3"><div className="min-w-0 flex-1"><strong>{item.name}</strong><p className="mission-muted mt-1 text-xs">{item.responsible_name||'Sem responsável'} · {item.member_count} integrantes · {item.structure_count} níveis · {item.active?'Ativo':'Inativo'}</p></div><button className="mission-btn min-h-10 px-3" onClick={()=>loadStructure(item.id)}>Estrutura</button>{canManage&&<button className="mission-btn min-h-10 px-3" aria-label={`Editar ${item.name}`} onClick={()=>{setEditingId(item.id);setDraft({...item,responsible_brother_id:item.responsible_brother_id||''})}}>Editar</button>}</div>
      {service?.id===item.id&&<section className="mt-3 border-l border-line pl-3 dark:border-shalom-gold/15"><p className="mission-muted py-2 text-sm">Obra / {service.name}</p>{service.root_members?.map(member=><p key={member.id} className="py-1 text-sm">{member.preferred_name||member.full_name}{member.function_title?` · ${member.function_title}`:''}</p>)}<ul className="grid gap-1">{service.nodes.map(node=><StructureNode key={node.id} node={node} servicesId={service.id} people={people} canManage={canManage} onRefresh={()=>loadStructure(service.id)}/>)}</ul>{canManage&&<details className="mt-3 border-t border-line/70 pt-2 dark:border-shalom-gold/10"><summary className="min-h-10 cursor-pointer font-semibold">Adicionar coordenação ou equipe</summary><form onSubmit={saveNode} className="grid gap-2 py-2 sm:grid-cols-2"><input required aria-label="Nome do nível" placeholder="Nome da coordenação ou equipe" className={field} value={nodeDraft.name} onChange={event=>setNodeDraft({...nodeDraft,name:event.target.value})}/><select aria-label="Tipo de nível" className={field} value={nodeDraft.node_type} onChange={event=>setNodeDraft({...nodeDraft,node_type:event.target.value})}><option value="coordination">Coordenação</option><option value="team">Equipe</option><option value="custom">Outro nível</option></select><select aria-label="Nível superior" className={field} value={nodeDraft.parent_node_id} onChange={event=>setNodeDraft({...nodeDraft,parent_node_id:event.target.value})}><option value="">Vincular diretamente ao serviço</option>{flatNodes.map(node=><option key={node.id} value={node.id}>{node.name}</option>)}</select><select aria-label="Responsável pelo nível" className={field} value={nodeDraft.responsible_brother_id} onChange={event=>setNodeDraft({...nodeDraft,responsible_brother_id:event.target.value})}><option value="">Sem responsável</option>{people.map(person=><option key={person.id} value={person.id}>{person.preferred_name||person.full_name}</option>)}</select><button className="mission-btn mission-btn-primary min-h-11 px-4">Adicionar nível</button></form></details>}<h3 className="mt-3 border-t border-line/70 pt-2 text-sm font-semibold dark:border-shalom-gold/10">Histórico do serviço</h3>{service.history.slice(0,6).map(entry=><p key={entry.id} className="mission-muted border-b border-line/50 py-1.5 text-xs">{entry.summary} · {formatDateTime(entry.created_at)}</p>)}</section>}
    </div>)}{!services.length&&<p className="mission-muted py-8 text-center text-sm">Nenhum serviço cadastrado.</p>}</div>
  </div>
}
