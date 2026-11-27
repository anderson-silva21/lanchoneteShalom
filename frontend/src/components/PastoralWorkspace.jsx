import { useCallback, useEffect, useMemo, useState } from 'react'

import { ChevronDown, ChevronLeft, ChevronRight, Users, UserCog } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'

import { api } from '../services/api'

import { brotherPermissionOptions, hasRole } from '../access'

import { BrothersManager } from './BrothersManager'
import { PrayerGroupsManager, ServicesManager } from './CommunityAdministration'



const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

const shift = (value, days) => { const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10) }

const perm = (user, value) => hasRole(user, 'admin') || (user?.brother_permissions?.includes('brothers:pastoral:coordinate') && [

  'brothers:read','brothers:create','brothers:update','brothers:groups:manage','brothers:ministries:manage','brothers:pastoral:manage','brothers:calendar:read','brothers:calendar:manage','brothers:followups:read','brothers:followups:create','brothers:followups:update'

].includes(value)) || (user?.brother_permissions?.includes('brothers:calendar:manage') && value==='brothers:calendar:read') || user?.brother_permissions?.includes(value)

const labels = { work: 'Evento da obra', pastoral_meeting: 'Reuniao pastoral', other: 'Outro compromisso', prayer_group: 'Grupo de oracao', pastoral_appointment: 'Acompanhamento pastoral' }
const eventStyles = { work: 'bg-sky-500/15 text-sky-900 dark:text-sky-200', pastoral_meeting: 'bg-violet-500/15 text-violet-900 dark:text-violet-200', other: 'bg-orange-500/15 text-orange-900 dark:text-orange-200', prayer_group: 'bg-emerald-500/15 text-emerald-900 dark:text-emerald-200', pastoral_appointment: 'bg-shalom-gold/15 text-shalom-deep dark:text-shalom-gold' }



function OrgChart({ tree, people, user, refresh }) {
  const navigate=useNavigate()

  const [role, setRole] = useState({ brother_id: '', role: 'pastor', started_on: today() })

  const [assignment, setAssignment] = useState({ sheep_brother_id: '', pastor_brother_id: '', started_on: today() })

  const [message, setMessage] = useState('')

  const manage = perm(user, 'brothers:pastoral:manage')

  async function assignRole(event) { event.preventDefault(); setMessage(''); try { await api.pastoralAssignRole(role); setMessage('Papel pastoral atualizado.'); refresh() } catch (error) { setMessage(error.message) } }

  async function assignSheep(event) { event.preventDefault(); setMessage(''); try { await api.pastoralAssignSheep(assignment); setMessage('Vinculo pastoral atualizado.'); refresh() } catch (error) { setMessage(error.message) } }

  async function endCoordinatorLink(id){try{await api.pastoralEndCoordinatorLink(id,today());setMessage('Vinculo com a coordenacao encerrado.');refresh()}catch(error){setMessage(error.message)}}

  const peopleOptions = people.map((item) => <option key={item.id} value={item.id}>{item.preferred_name || item.full_name}</option>)

  return <div className="grid gap-5">

    {message && <p role="status" className="mission-muted text-sm">{message}</p>}

    {tree?.coordinator && <section className="rounded-2xl border border-line p-4 dark:border-shalom-gold/20"><h3 className="font-display text-lg font-semibold">Coordenador dos Pastores</h3><Person person={tree.coordinator} onClick={perm(user,'brothers:read')?()=>navigate(`/gestao-irmaos/${tree.coordinator.id}`):undefined} /></section>}

    {tree?.self && <section className="rounded-2xl border border-line p-4 dark:border-shalom-gold/20"><h3 className="font-display text-lg font-semibold">Meu cadastro</h3><Person person={tree.self} /><p className="mt-2 text-sm">Pastor responsavel: {tree.self_pastor?.preferred_name || tree.self_pastor?.full_name || 'Sem vinculo ativo'}</p></section>}

    <div className="grid gap-3 md:grid-cols-2">{(tree?.pastors || []).map((pastor) => <details key={pastor.id} open className="rounded-2xl border border-line p-4 dark:border-shalom-gold/20"><summary className="cursor-pointer list-none"><Person person={pastor} onClick={perm(user,'brothers:read')?()=>navigate(`/gestao-irmaos/${pastor.id}`):undefined} /><span className="mission-muted mt-2 block text-sm">{pastor.sheep_count} ovelhas vinculadas</span></summary><div className="mt-4 grid gap-2 border-t border-line pt-3 dark:border-shalom-gold/20">{pastor.sheep?.map((sheep) => perm(user,'brothers:read')?<button key={sheep.id} type="button" onClick={()=>navigate(`/gestao-irmaos/${sheep.id}`)} className="rounded-xl bg-black/5 px-3 py-2 text-left text-sm dark:bg-white/5">{sheep.preferred_name || sheep.full_name}</button>:<div key={sheep.id} className="rounded-xl bg-black/5 px-3 py-2 text-sm dark:bg-white/5">{sheep.preferred_name || sheep.full_name}</div>)}{pastor.sheep?.length === 0 && <p className="mission-muted text-sm">Lista restrita pelas permissoes deste perfil.</p>}{manage&&pastor.coordinator_assignment_id&&<button type="button" className="mission-btn mt-2 min-h-10 justify-self-start px-3" onClick={()=>endCoordinatorLink(pastor.coordinator_assignment_id)}>Encerrar vinculo com coordenacao</button>}</div></details>)}</div>

    {manage && <details className="mt-3 border-t border-line pt-3 dark:border-shalom-gold/20"><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-shalom-blue dark:text-shalom-gold">Gerenciar estrutura pastoral</summary><div className="mt-3 grid gap-5 lg:grid-cols-2">

      <form onSubmit={assignRole} className="grid gap-3"><h3 className="font-display text-lg font-semibold">Definir papel pastoral</h3><select required className="mission-input h-11 px-3" value={role.brother_id} onChange={(event) => setRole({ ...role, brother_id: event.target.value })}><option value="">Selecionar irmao</option>{peopleOptions}</select><select className="mission-input h-11 px-3" value={role.role} onChange={(event) => setRole({ ...role, role: event.target.value })}><option value="coordinator">Coordenador</option><option value="pastor">Pastor</option><option value="sheep">Ovelha</option></select><input type="date" className="mission-input h-11 px-3" value={role.started_on} onChange={(event) => setRole({ ...role, started_on: event.target.value })} /><button className="mission-btn mission-btn-primary min-h-11 px-4">Salvar papel</button></form>

      <form onSubmit={assignSheep} className="grid gap-3"><h3 className="font-display text-lg font-semibold">Vincular ovelha a pastor</h3><select required className="mission-input h-11 px-3" value={assignment.sheep_brother_id} onChange={(event) => setAssignment({ ...assignment, sheep_brother_id: event.target.value })}><option value="">Selecionar ovelha</option>{peopleOptions}</select><select required className="mission-input h-11 px-3" value={assignment.pastor_brother_id} onChange={(event) => setAssignment({ ...assignment, pastor_brother_id: event.target.value })}><option value="">Selecionar pastor</option>{peopleOptions}</select><input type="date" className="mission-input h-11 px-3" value={assignment.started_on} onChange={(event) => setAssignment({ ...assignment, started_on: event.target.value })} /><button className="mission-btn mission-btn-primary min-h-11 px-4">Salvar vinculo</button></form>

    </div></details>}

  </div>

}



function Person({ person, onClick }) { const content=<><span className="grid h-12 w-12 place-items-center overflow-hidden rounded-full bg-shalom-gold/15">{person.photo_url ? <img className="h-full w-full object-cover" src={person.photo_url} alt="" /> : <Users size={20} />}</span><strong>{person.preferred_name || person.full_name}</strong></>; return onClick ? <button type="button" className="mt-3 flex items-center gap-3 text-left" onClick={(event)=>{event.stopPropagation();onClick()}}>{content}</button> : <span className="mt-3 flex items-center gap-3">{content}</span> }



function CalendarPeriodControls({ cursor, mode, setMode, range, shiftCursor }) {
  const periodLabel = mode === 'month'
    ? new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${cursor}T12:00:00Z`))
    : `${range[0]}${range[1] !== range[0] ? ` - ${range[1]}` : ''}`
  const options = [['month', 'Mes'], ['week', 'Semana'], ['day', 'Dia'], ['upcoming', 'Proximos']]

  return <div className="brothers-calendar-period">
    <button className="mission-btn grid h-11 w-11 shrink-0 place-items-center" onClick={() => shiftCursor(-1)} aria-label="Periodo anterior"><ChevronLeft size={18}/></button>
    <strong className="min-w-0 text-center text-sm">{periodLabel}</strong>
    <button className="mission-btn grid h-11 w-11 shrink-0 place-items-center" onClick={() => shiftCursor(1)} aria-label="Proximo periodo"><ChevronRight size={18}/></button>
    <div className="hidden items-center gap-1 md:flex">{options.map(([id,label]) => <button key={id} type="button" className={`mission-btn min-h-11 px-3 text-sm ${mode===id?'mission-btn-primary':''}`} onClick={() => setMode(id)}>{label}</button>)}</div>
    <label className="sr-only" htmlFor="calendar-period-mode">Exibicao do calendario</label>
    <select id="calendar-period-mode" className="mission-input h-11 px-2 text-sm md:hidden" value={mode} onChange={(event) => setMode(event.target.value)}>{options.map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select>
  </div>
}

function MonthCalendar({ cursor, items, onSelect, onSelectDate, selectedDate }) {
  const value = new Date(`${cursor}T12:00:00Z`)
  const year = value.getUTCFullYear()
  const month = value.getUTCMonth()
  const first = new Date(Date.UTC(year, month, 1, 12))
  const count = new Date(Date.UTC(year, month + 1, 0, 12)).getUTCDate()
  const monthName = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' }).format(value)
  const cells = Array.from({ length: first.getUTCDay() + count }, (_, index) => index < first.getUTCDay() ? null : index - first.getUTCDay() + 1)

  return <div role="grid" aria-label="Calendario mensal" className="calendar-month-grid">
    {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'].map((day) => <span key={day} role="columnheader" className="mission-muted py-1 text-center text-[10px] font-semibold sm:text-xs">{day}</span>)}
    {cells.map((day, index) => {
      if (day === null) return <span key={`empty-${index}`} aria-hidden="true" className="calendar-empty-day" />
      const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const dayEvents = items.filter((item) => item.occurrence_date === date)
      return <div role="gridcell" key={date} className="calendar-month-day">
        <button type="button" className="calendar-day-button" aria-label={`${day} de ${monthName}, ${dayEvents.length} evento${dayEvents.length === 1 ? '' : 's'}`} aria-pressed={selectedDate === date} onClick={() => onSelectDate(date)}>
          <span>{day}</span>
          {dayEvents.length > 0 && <span className="calendar-day-marker" aria-hidden="true">{dayEvents.length > 3 ? '3+' : dayEvents.length}</span>}
        </button>
        <div className="hidden md:block">{dayEvents.slice(0, 2).map((item) => <button key={`${item.id}-${item.occurrence_date}`} type="button" onClick={() => onSelect(item)} className={`mt-1 block w-full truncate rounded px-1 py-0.5 text-left text-[10px] sm:text-xs ${eventStyles[item.event_type] || eventStyles.other}`}>{item.start_time ? `${item.start_time} ` : ''}{item.title}</button>)}</div>
      </div>
    })}
  </div>
}


function ModuleUserAccess({ user, onSave }) {

  const [selected,setSelected]=useState(user.permissions || [])

  useEffect(()=>setSelected(user.permissions || []),[user.id,user.permissions])

  return <details className="mt-2"><summary className="cursor-pointer text-sm font-semibold">Editar permissoes</summary><fieldset className="mt-2 grid gap-2">{brotherPermissionOptions.map((option)=><label key={option.value} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.includes(option.value)} onChange={(event)=>setSelected(event.target.checked?[...selected,option.value]:selected.filter((permission)=>permission!==option.value))}/>{option.label}</label>)}</fieldset><button type="button" className="mission-btn mt-2 min-h-10 px-3" onClick={()=>onSave(user.id,selected,Boolean(user.active))}>Salvar permissoes</button></details>

}





function CommunityCalendar({ user, groups, ministries, people }) {

  const [mode, setMode] = useState('month')

  const [cursor, setCursor] = useState(today())

  const [items, setItems] = useState([])

  const [message, setMessage] = useState('')

  const [draft, setDraft] = useState({ title: '', description: '', event_type: 'work', event_date: today(), start_time: '19:00', end_time: '20:00', location: '', visibility: 'community', status: 'scheduled', recurrence_interval: 0, recurrence_until: '', participant_ids: [], ministry_id: '', group_id: '' })

  const [personalDraft, setPersonalDraft] = useState({ title: '', description: '', event_type: 'other', event_date: today(), start_time: '', end_time: '', location: '', status: 'scheduled', recurrence_interval: 0, recurrence_until: '' })

  const [schedule, setSchedule] = useState({ group_id: '', day_of_week: 2, start_time: '19:30', end_time: '21:00', location: '', starts_on: today(), ends_on: '', interval_weeks: 1 })

  const [event, setEvent] = useState(null)

  const [eventDraft, setEventDraft] = useState({})

  const [view, setView] = useState('calendar')
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(null)

  const canManage = perm(user, 'brothers:calendar:manage')

  const groupManage = perm(user, 'brothers:groups:manage')

  const canCreatePersonal=perm(user,'brothers:followups:create')

  const availableViews=[['calendar','Agenda'],...(canManage?[['event','Novo evento da Obra']]:[]),...(canCreatePersonal?[['personal','Meu compromisso']]:[]),...(groupManage?[['group','Recorrencia de grupo']]:[])]
  const activeViewLabel=availableViews.find(([id])=>id===view)?.[1]||'Agenda'

  const range = useMemo(() => {

    if (mode === 'day') return [cursor, cursor]

    if (mode === 'week') { const weekday = new Date(`${cursor}T12:00:00Z`).getUTCDay(); const from = shift(cursor, -weekday); return [from, shift(from, 6)] }

    if (mode === 'upcoming') return [cursor, shift(cursor, 29)]

    const date = new Date(`${cursor}T12:00:00Z`); const from = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 12)).toISOString().slice(0, 10); const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 12)).toISOString().slice(0, 10); return [from, end]

  }, [cursor, mode])

  const [rangeFrom, rangeTo] = range

  const load = useCallback(async () => { try { setItems(await api.pastoralCalendar(rangeFrom, rangeTo)); setMessage('') } catch (error) { setMessage(error.message) } }, [rangeFrom, rangeTo])

  useEffect(() => { load() }, [load])

  async function createEvent(event) { event.preventDefault(); setMessage(''); try { await api.createPastoralEvent({ ...draft, ministry_id:draft.ministry_id?Number(draft.ministry_id):null,group_id:draft.group_id?Number(draft.group_id):null,responsible_user_id: user.id, participant_ids:draft.participant_ids.map(Number), recurrence_until: draft.recurrence_interval ? draft.recurrence_until || null : null }); setMessage('Evento salvo.'); await load() } catch (error) { setMessage(error.message) } }

  async function createPersonalEvent(event) { event.preventDefault(); setMessage(''); try { await api.createPersonalPastoralEvent({ ...personalDraft, recurrence_until: personalDraft.recurrence_interval ? personalDraft.recurrence_until || null : null }); setMessage('Compromisso pessoal salvo.'); setPersonalDraft({...personalDraft,title:'',description:'',event_date:today()}); await load() } catch (error) { setMessage(error.message) } }

  async function createSchedule(event) { event.preventDefault(); setMessage(''); try { await api.createGroupSchedule(schedule.group_id, { ...schedule, group_id: undefined, ends_on: schedule.ends_on || null, active: true }); setMessage('Recorrencia semanal cadastrada.'); await load() } catch (error) { setMessage(error.message) } }

  function openEvent(item){setEvent(item);setEventDraft({title:item.title||'',description:item.description||'',start_time:item.start_time||'',end_time:item.end_time||'',location:item.location||'',status:item.status||'scheduled',moved_to_date:item.series_date&&item.series_date!==item.occurrence_date?item.occurrence_date:''})}

  async function saveOccurrence(formEvent){formEvent.preventDefault();try{const group=String(event?.id||'').match(/^group-(\d+)-(.+)$/);const payload={status:eventDraft.status||'scheduled',start_time:eventDraft.start_time||null,end_time:eventDraft.end_time||null,location:eventDraft.location||null,moved_to_date:eventDraft.moved_to_date||null};if(group)await api.updateGroupOccurrence(group[1],group[2],payload);else if(event.visibility==='private'&&Number(event.responsible_user_id)===Number(user.id)&&!canManage)await api.updatePersonalPastoralOccurrence(event.id,event.series_date||event.occurrence_date,{...payload,title:eventDraft.title,description:eventDraft.description});else await api.updatePastoralOccurrence(event.id,event.series_date||event.occurrence_date,{...payload,title:eventDraft.title,description:eventDraft.description});setEvent(null);await load()}catch(error){setMessage(error.message)}}

  async function cancelOne(item) { try { const [, id, date] = String(item.id).match(/^group-(\d+)-(.+)$/) || []; if (id) await api.updateGroupOccurrence(id, date, { status: 'cancelled' }); else if(item.visibility==='private'&&Number(item.responsible_user_id)===Number(user.id)&&!canManage) await api.updatePersonalPastoralOccurrence(item.id,item.series_date||item.occurrence_date,{status:'cancelled'}); else await api.updatePastoralOccurrence(item.id, item.series_date||item.occurrence_date, { status: 'cancelled' }); setEvent(null); await load() } catch (error) { setMessage(error.message) } }

  return <div className="grid gap-5">

    <nav className="brothers-calendar-mode-tabs" aria-label="Areas do calendario"><div className="hidden flex-wrap items-center gap-2 md:flex">{availableViews.map(([id,label])=><button key={id} type="button" className={`mission-btn min-h-11 px-3 ${view===id?'mission-btn-primary':''}`} onClick={()=>setView(id)}>{label}</button>)}</div><details className="brothers-mobile-subnav relative md:hidden"><summary><span>{activeViewLabel}</span><ChevronDown size={17}/></summary><div className="absolute left-0 right-0 top-full z-30 mt-1 grid max-h-[60dvh] overflow-y-auto border-y border-line bg-white py-1 shadow-lg dark:border-shalom-gold/15 dark:bg-shalom-night">{availableViews.map(([id,label])=><button key={id} type="button" className={view===id?'active':''} onClick={(event)=>{setView(id);event.currentTarget.closest('details')?.removeAttribute('open')}}>{label}</button>)}</div></details></nav>

    {message && <p role="status" className="mission-muted text-sm">{message}</p>}

    {view === 'event' && canManage && <form onSubmit={createEvent} className="grid gap-3 sm:grid-cols-2"><h3 className="font-display text-lg font-semibold sm:col-span-2">Novo evento da Obra</h3><label className="text-sm">Título<input required maxLength="180" className="mission-input mt-1 h-11 w-full px-3" value={draft.title} onChange={(e)=>setDraft({...draft,title:e.target.value})}/></label><label className="text-sm">Tipo<select className="mission-input mt-1 h-11 w-full px-3" value={draft.event_type} onChange={(e)=>setDraft({...draft,event_type:e.target.value})}><option value="work">Evento da Obra</option><option value="pastoral_meeting">Reunião pastoral</option><option value="other">Outro</option></select></label><label className="text-sm">Data<input type="date" required className="mission-input mt-1 h-11 w-full px-3" value={draft.event_date} onChange={(e)=>setDraft({...draft,event_date:e.target.value})}/></label><label className="text-sm">Visibilidade<select className="mission-input mt-1 h-11 w-full px-3" value={draft.visibility} onChange={(e)=>setDraft({...draft,visibility:e.target.value})}><option value="community">Toda a Obra</option><option value="pastoral">Pastoral autorizada</option><option value="private">Privado e participantes</option></select></label><label className="text-sm">Serviço relacionado<select className="mission-input mt-1 h-11 w-full px-3" value={draft.ministry_id} onChange={(e)=>setDraft({...draft,ministry_id:e.target.value})}><option value="">Evento geral</option>{ministries.map(service=><option key={service.id} value={service.id}>{service.name}</option>)}</select></label><label className="text-sm">Grupo relacionado<select className="mission-input mt-1 h-11 w-full px-3" value={draft.group_id} onChange={(e)=>setDraft({...draft,group_id:e.target.value})}><option value="">Nenhum grupo</option>{groups.map(group=><option key={group.id} value={group.id}>{group.name}</option>)}</select></label><label className="text-sm">Início<input type="time" className="mission-input mt-1 h-11 w-full px-3" value={draft.start_time} onChange={(e)=>setDraft({...draft,start_time:e.target.value})}/></label><label className="text-sm">Término<input type="time" className="mission-input mt-1 h-11 w-full px-3" value={draft.end_time} onChange={(e)=>setDraft({...draft,end_time:e.target.value})}/></label><label className="text-sm">Local<input maxLength="240" className="mission-input mt-1 h-11 w-full px-3" value={draft.location} onChange={(e)=>setDraft({...draft,location:e.target.value})}/></label><label className="text-sm sm:col-span-2">Descrição<textarea maxLength="4000" className="mission-input mt-1 min-h-20 w-full px-3 py-2" value={draft.description} onChange={(e)=>setDraft({...draft,description:e.target.value})}/></label><label className="text-sm sm:col-span-2">Participantes<select multiple className="mission-input mt-1 min-h-24 w-full px-3 py-2" value={draft.participant_ids} onChange={(e)=>setDraft({...draft,participant_ids:[...e.target.selectedOptions].map((option)=>option.value)})}>{people.map((person)=><option key={person.id} value={person.id}>{person.preferred_name||person.full_name}</option>)}</select></label><label className="text-sm">Repetir a cada (semanas)<input type="number" min="0" max="52" className="mission-input mt-1 h-11 w-full px-3" value={draft.recurrence_interval} onChange={(e)=>setDraft({...draft,recurrence_interval:Number(e.target.value)})}/></label>{draft.recurrence_interval>0&&<label className="text-sm">Repetir até<input type="date" className="mission-input mt-1 h-11 w-full px-3" value={draft.recurrence_until} onChange={(e)=>setDraft({...draft,recurrence_until:e.target.value})}/></label>}<button className="mission-btn mission-btn-primary min-h-11 px-4 sm:col-span-2">Salvar evento</button></form>}

    {view==='personal'&&canCreatePersonal&&<form onSubmit={createPersonalEvent} className="grid gap-3 sm:grid-cols-2"><h3 className="font-display text-lg font-semibold sm:col-span-2">Organizar compromisso pessoal</h3><label className="text-sm sm:col-span-2">Título<input required maxLength="180" className="mission-input mt-1 h-11 w-full px-3" value={personalDraft.title} onChange={event=>setPersonalDraft({...personalDraft,title:event.target.value})}/></label><label className="text-sm">Data<input required type="date" className="mission-input mt-1 h-11 w-full px-3" value={personalDraft.event_date} onChange={event=>setPersonalDraft({...personalDraft,event_date:event.target.value})}/></label><label className="text-sm">Local<input maxLength="240" className="mission-input mt-1 h-11 w-full px-3" value={personalDraft.location} onChange={event=>setPersonalDraft({...personalDraft,location:event.target.value})}/></label><label className="text-sm">Início<input type="time" className="mission-input mt-1 h-11 w-full px-3" value={personalDraft.start_time} onChange={event=>setPersonalDraft({...personalDraft,start_time:event.target.value})}/></label><label className="text-sm">Término<input type="time" className="mission-input mt-1 h-11 w-full px-3" value={personalDraft.end_time} onChange={event=>setPersonalDraft({...personalDraft,end_time:event.target.value})}/></label><label className="text-sm sm:col-span-2">Descrição (privada)<textarea maxLength="4000" className="mission-input mt-1 min-h-20 w-full px-3 py-2" value={personalDraft.description} onChange={event=>setPersonalDraft({...personalDraft,description:event.target.value})}/></label><label className="text-sm">Repetir a cada (semanas)<input type="number" min="0" max="52" className="mission-input mt-1 h-11 w-full px-3" value={personalDraft.recurrence_interval} onChange={event=>setPersonalDraft({...personalDraft,recurrence_interval:Number(event.target.value)})}/></label>{personalDraft.recurrence_interval>0&&<label className="text-sm">Repetir até<input type="date" className="mission-input mt-1 h-11 w-full px-3" value={personalDraft.recurrence_until} onChange={event=>setPersonalDraft({...personalDraft,recurrence_until:event.target.value})}/></label>}<button className="mission-btn mission-btn-primary min-h-11 px-4 sm:col-span-2">Salvar compromisso</button></form>}

    {view === 'group' && groupManage && <form onSubmit={createSchedule} className="grid gap-3 rounded-2xl border border-line p-4 dark:border-shalom-gold/20 sm:grid-cols-2"><h3 className="font-display text-lg font-semibold sm:col-span-2">Recorrencia de grupo de oracao</h3><label className="text-sm sm:col-span-2">Grupo<select required className="mission-input mt-1 h-11 w-full px-3" value={schedule.group_id} onChange={(e)=>setSchedule({...schedule,group_id:e.target.value})}><option value="">Selecionar grupo</option>{groups.filter((g)=>g.active).map((g)=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label><label className="text-sm">Dia da semana<select className="mission-input mt-1 h-11 w-full px-3" value={schedule.day_of_week} onChange={(e)=>setSchedule({...schedule,day_of_week:Number(e.target.value)})}>{['Domingo','Segunda','Terca','Quarta','Quinta','Sexta','Sabado'].map((day,i)=><option key={day} value={i}>{day}</option>)}</select></label><label className="text-sm">Frequencia (semanas)<input type="number" min="1" max="52" className="mission-input mt-1 h-11 w-full px-3" value={schedule.interval_weeks} onChange={(e)=>setSchedule({...schedule,interval_weeks:Number(e.target.value)})}/></label><label className="text-sm">Inicio<input type="time" className="mission-input mt-1 h-11 w-full px-3" value={schedule.start_time} onChange={(e)=>setSchedule({...schedule,start_time:e.target.value})}/></label><label className="text-sm">Termino<input type="time" className="mission-input mt-1 h-11 w-full px-3" value={schedule.end_time} onChange={(e)=>setSchedule({...schedule,end_time:e.target.value})}/></label><label className="text-sm">Local<input className="mission-input mt-1 h-11 w-full px-3" value={schedule.location} onChange={(e)=>setSchedule({...schedule,location:e.target.value})}/></label><label className="text-sm">Data de inicio<input type="date" className="mission-input mt-1 h-11 w-full px-3" value={schedule.starts_on} onChange={(e)=>setSchedule({...schedule,starts_on:e.target.value})}/></label><label className="text-sm">Data de encerramento<input type="date" className="mission-input mt-1 h-11 w-full px-3" value={schedule.ends_on} onChange={(e)=>setSchedule({...schedule,ends_on:e.target.value})}/></label><button className="mission-btn mission-btn-primary min-h-11 px-4">Salvar recorrencia</button></form>}

    {view === 'calendar' && <><CalendarPeriodControls cursor={cursor} mode={mode} setMode={(nextMode)=>{setMode(nextMode);setSelectedCalendarDate(null)}} range={range} shiftCursor={(direction)=>{setSelectedCalendarDate(null);setCursor(shift(cursor,mode==='month'?direction*28:mode==='week'?direction*7:direction))}}/>{mode==='month'&&<MonthCalendar cursor={cursor} items={items} onSelect={openEvent} selectedDate={selectedCalendarDate} onSelectDate={(date)=>setSelectedCalendarDate((current)=>current===date?null:date)}/>}{selectedCalendarDate&&mode==='month'&&<div className="flex items-center justify-between gap-3 border-b border-line/70 py-2 dark:border-shalom-gold/10"><span className="mission-muted text-xs">Agenda de {selectedCalendarDate}</span><button type="button" className="min-h-10 text-xs font-semibold text-shalom-blue dark:text-shalom-gold" onClick={()=>setSelectedCalendarDate(null)}>Ver o mes todo</button></div>}<div className="divide-y divide-line/80 dark:divide-shalom-gold/10">{(selectedCalendarDate&&mode==='month'?items.filter((item)=>item.occurrence_date===selectedCalendarDate):items).map((item)=><button key={`${item.id}-${item.occurrence_date}`} type="button" onClick={()=>openEvent(item)} className="flex min-h-14 w-full flex-wrap items-center gap-x-3 gap-y-1 py-2 text-left"><time className="w-24 shrink-0 text-sm font-semibold">{item.occurrence_date}{item.start_time?` · ${item.start_time}`:''}</time><span className={`rounded-full px-2 py-1 text-xs ${eventStyles[item.event_type]||eventStyles.other}`}>{labels[item.event_type] || labels.other}</span><span className="min-w-0 flex-1 text-sm">{item.title}</span><span className="mission-muted w-full pl-24 text-xs">{item.service_name||item.group_name?`${item.service_name||item.group_name} · `:''}{item.location||''}</span></button>)}{(selectedCalendarDate&&mode==='month'?items.filter((item)=>item.occurrence_date===selectedCalendarDate):items).length===0&&<p className="mission-muted py-8 text-center text-sm">Nenhum compromisso visível neste período.</p>}</div>{event&&<div role="dialog" aria-modal="true" className="fixed inset-0 z-50 grid place-items-end bg-black/50 p-0 sm:place-items-center sm:p-4" onClick={()=>setEvent(null)}><div className="mission-panel grid max-h-[90dvh] w-full max-w-lg gap-3 overflow-y-auto rounded-t-2xl p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:rounded-2xl sm:p-5" onClick={(e)=>e.stopPropagation()}><h3 className="font-display text-xl font-semibold">{event.title}</h3><p>{event.occurrence_date} · {labels[event.event_type]||labels.other}</p>{event.start_time&&<p>{event.start_time}{event.end_time?`–${event.end_time}`:''}</p>}{event.location&&<p>{event.location}</p>}{event.description&&<p>{event.description}</p>}{(canManage||(canCreatePersonal&&event.visibility==='private'&&Number(event.responsible_user_id)===Number(user.id)))&&event.event_type!=='pastoral_appointment'&&<form onSubmit={saveOccurrence} className="grid gap-2"><label className="text-sm">Título<input className="mission-input mt-1 h-11 w-full px-3" value={eventDraft.title||''} onChange={(e)=>setEventDraft({...eventDraft,title:e.target.value})}/></label><label className="text-sm">Início<input type="time" className="mission-input mt-1 h-11 w-full px-3" value={eventDraft.start_time||''} onChange={(e)=>setEventDraft({...eventDraft,start_time:e.target.value})}/></label><label className="text-sm">Término<input type="time" className="mission-input mt-1 h-11 w-full px-3" value={eventDraft.end_time||''} onChange={(e)=>setEventDraft({...eventDraft,end_time:e.target.value})}/></label><label className="text-sm">Local<input className="mission-input mt-1 h-11 w-full px-3" value={eventDraft.location||''} onChange={(e)=>setEventDraft({...eventDraft,location:e.target.value})}/></label><label className="text-sm">Descrição<textarea className="mission-input mt-1 min-h-16 w-full px-3 py-2" value={eventDraft.description||''} onChange={(e)=>setEventDraft({...eventDraft,description:e.target.value})}/></label><label className="text-sm">Nova data<input type="date" className="mission-input mt-1 h-11 w-full px-3" value={eventDraft.moved_to_date||''} onChange={(e)=>setEventDraft({...eventDraft,moved_to_date:e.target.value})}/></label><label className="text-sm">Situação<select className="mission-input mt-1 h-11 w-full px-3" value={eventDraft.status||'scheduled'} onChange={(e)=>setEventDraft({...eventDraft,status:e.target.value})}><option value="scheduled">Agendado</option><option value="completed">Realizado</option><option value="cancelled">Cancelado</option></select></label><button className="mission-btn mission-btn-primary min-h-11 px-3">Salvar apenas esta data</button></form>}{(canManage||(canCreatePersonal&&event.visibility==='private'&&Number(event.responsible_user_id)===Number(user.id)))&&event.event_type!=='pastoral_appointment'&&<button className="mission-btn min-h-11 px-3" onClick={()=>cancelOne(event)}>Cancelar esta data</button>}<button className="mission-btn min-h-11 px-3" onClick={()=>setEvent(null)}>Fechar</button></div></div>}</>}

  </div>

}



function CommunityOverview({ overview, setSection }) {
  const metrics = [
    ['Irm\u00e3os cadastrados', overview?.totals?.brothers],
    ['Pastores', overview?.totals?.pastors],
    ['Servi\u00e7os e minist\u00e9rios', overview?.totals?.services],
    ['Grupos de ora\u00e7\u00e3o', overview?.totals?.groups],
    ['Integrantes em grupos', overview?.totals?.group_members]
  ].filter(([, value]) => value !== null && value !== undefined)
  const upcoming = overview?.upcoming || []
  const recent = overview?.recent_activities || []
  const shortcuts = [
    ['Servi\u00e7os e minist\u00e9rios', 'ministries', overview?.services || []],
    ['Grupos de ora\u00e7\u00e3o', 'groups', overview?.groups || []]
  ]

  return <div className="grid gap-7">
    <header className="border-b border-line pb-4 dark:border-shalom-gold/10">
      <p className="mission-muted text-xs font-semibold uppercase tracking-[0.12em]">Comunidade Shalom</p>
      <h2 className="mt-1 font-display text-2xl font-semibold">{'Vis\u00e3o da Obra'}</h2>
      <p className="mission-muted mt-1 text-sm">{'Pessoas, servi\u00e7os e encontros da comunidade.'}</p>
    </header>
    <dl className="brothers-overview-metrics border-y border-line/70 dark:border-shalom-gold/10">
      {metrics.map(([label, value]) => <div key={label} className="brothers-overview-metric"><dd className="font-display text-xl font-semibold leading-tight text-shalom-deep dark:text-white">{value}</dd><dt className="mission-muted mt-1 text-xs leading-snug">{label}</dt></div>)}
    </dl>
    <div className="grid gap-7 md:grid-cols-2">
      <section>
        <div className="mb-1 flex items-center justify-between border-b border-line pb-2 dark:border-shalom-gold/10"><h3 className="font-semibold">{'Pr\u00f3ximos eventos'}</h3><button type="button" className="min-h-9 text-xs font-semibold text-shalom-blue dark:text-shalom-gold" onClick={() => setSection('calendar')}>{'Abrir calend\u00e1rio'}</button></div>
        {upcoming.slice(0, 6).map((item) => <div key={`${item.id}-${item.occurrence_date}`} className="flex min-h-14 items-center gap-3 border-b border-line/60 py-2 dark:border-shalom-gold/10"><time className="w-20 shrink-0 text-xs font-semibold text-shalom-blue dark:text-shalom-gold">{item.occurrence_date}</time><span className="min-w-0 flex-1"><strong className="block truncate text-sm font-medium">{item.title}</strong><span className="mission-muted text-xs">{item.start_time || 'Hor\u00e1rio a definir'}{item.location ? ` \u00b7 ${item.location}` : ''}</span></span></div>)}
        {!upcoming.length && <p className="mission-muted py-3 text-sm">{'Nenhum evento pr\u00f3ximo.'}</p>}
      </section>
      <section>
        <h3 className="mb-1 border-b border-line pb-2 font-semibold dark:border-shalom-gold/10">Atividades recentes</h3>
        {recent.slice(0, 6).map((item, index) => <div key={`${item.action}-${index}`} className="flex min-h-14 items-center justify-between gap-3 border-b border-line/60 py-2 dark:border-shalom-gold/10"><span className="min-w-0 text-sm">{item.summary}</span><time className="mission-muted shrink-0 text-[11px]">{item.created_at}</time></div>)}
        {!recent.length && <p className="mission-muted py-3 text-sm">Nenhuma atividade recente.</p>}
      </section>
    </div>
    <div className="grid gap-6 md:grid-cols-2">
      {shortcuts.map(([title, target, items]) => items.length > 0 && <section key={target}><button type="button" className="mb-1 flex min-h-10 w-full items-center justify-between border-b border-line pb-2 text-left font-semibold dark:border-shalom-gold/10" onClick={() => setSection(target)}>{title}<span className="text-xs font-medium text-shalom-blue dark:text-shalom-gold">Ver todos</span></button>{items.slice(0, 4).map((item) => <button key={item.id} type="button" className="flex min-h-11 w-full items-center justify-between gap-3 border-b border-line/60 text-left text-sm dark:border-shalom-gold/10" onClick={() => setSection(target)}><span className="truncate">{item.name}</span><span className="mission-muted shrink-0 text-xs">{item.member_count} integrantes</span></button>)}</section>)}
    </div>
  </div>
}

export function PastoralWorkspace({ user }) {
  const location=useLocation()
  const [section, setSection] = useState(()=>location.pathname.match(/^\/gestao-irmaos\/(\d+|novo)$/)?'people':'overview')

  const [tree, setTree] = useState(null)

  const [people, setPeople] = useState([])

  const [groups, setGroups] = useState([])

  const [ministries, setMinistries] = useState([])

  const [overview, setOverview] = useState(null)

  const [pastoralHome, setPastoralHome] = useState(null)

  const [sheepProfile, setSheepProfile] = useState(null)

  const [self, setSelf] = useState(null)

  const [users, setUsers] = useState([])

  const [sheep, setSheep] = useState([])

  const [appointment, setAppointment] = useState({ brother_id: '', occurred_on: today(), start_time: '19:00', end_time: '20:00', location: '', category: 'pastoral', notes: '' })

  const [appointments, setAppointments] = useState([])

  const [appointmentId, setAppointmentId] = useState(null)

  const [newUser, setNewUser] = useState({ name: '', username: '', brother_id: '', permissions: ['brothers:calendar:read','brothers:self:access'] })

  const [temporaryPassword, setTemporaryPassword] = useState('')

  const [message, setMessage] = useState('')

  const canRead=perm(user,'brothers:read'), canCreate=perm(user,'brothers:create'), groupManage=perm(user,'brothers:groups:manage')

  const canCalendar=perm(user,'brothers:calendar:read')||perm(user,'brothers:calendar:manage')||perm(user,'brothers:followups:read')||perm(user,'brothers:followups:create')||perm(user,'brothers:self:access')

  const canStructure=perm(user,'brothers:pastoral:coordinate')||perm(user,'brothers:pastoral:manage')||canRead||perm(user,'brothers:self:access')

  const canReadAppointments=perm(user,'brothers:followups:read'), canCreateAppointments=perm(user,'brothers:followups:create'), canUpdateAppointments=perm(user,'brothers:followups:update')

  const canReadGroups=canRead||groupManage
  const canManageServices=perm(user,'brothers:ministries:manage')
  const canReadServices=canRead||canManageServices
  const isPastor=pastoralHome?.role==='pastor'
  const sections=[['overview',isPastor?'Inicio':'Visao geral',true],['sheep','Minhas ovelhas',isPastor],['people','Irmaos',canRead||canCreate],['ministries','Servicos',canReadServices],['groups','Grupos',canReadGroups],['org','Organograma',canStructure],['calendar',isPastor?'Agenda':'Calendario',canCalendar],['appointments','Acompanhamentos',canReadAppointments||canCreateAppointments||canUpdateAppointments],['users','Acessos',perm(user,'brothers:users:manage')]].filter(([, , visible])=>visible)
  useEffect(()=>{if(location.pathname.match(/^\/gestao-irmaos\/(\d+|novo)$/))setSection('people')},[location.pathname])

  const reloadTree=useCallback(async()=>{try{setTree(await api.pastoralOrgchart())}catch(error){setMessage(error.message)}},[])

  useEffect(()=>{if(canStructure)reloadTree(); if(canRead||canCreate||groupManage||canManageServices||perm(user,'brothers:pastoral:manage')||perm(user,'brothers:users:manage')){api.brotherPeople().then((items)=>setPeople(Array.isArray(items)?items:[])).catch(()=>{})} if(canReadGroups){api.brotherGroups().then((items)=>setGroups(Array.isArray(items)?items:[])).catch(()=>{})} if(canReadServices){api.brotherMinistries().then((items)=>setMinistries(Array.isArray(items)?items:[])).catch(()=>{})} if(perm(user,'brothers:self:access'))api.pastoralMe().then(setSelf).catch(()=>{})},[reloadTree,user,canRead,canCreate,canStructure,groupManage,canReadGroups,canReadServices,canManageServices])

  useEffect(()=>{api.pastoralOverview().then(setOverview).catch((error)=>setMessage(error.message));api.pastoralHome().then(setPastoralHome).catch(()=>{})},[user])

  useEffect(()=>{if(perm(user,'brothers:followups:create'))api.pastoralSheep().then((items)=>setSheep(Array.isArray(items)?items:[])).catch((error)=>setMessage(error.message))},[user])

  useEffect(()=>{if(canReadAppointments&&section==='appointments')api.pastoralAppointments().then(setAppointments).catch((error)=>setMessage(error.message))},[section,user.id,canReadAppointments])

  useEffect(()=>{if(perm(user,'brothers:users:manage')&&section==='users')api.pastoralUsers().then((items)=>setUsers(Array.isArray(items)?items:[])).catch((error)=>setMessage(error.message))},[section,user])

  async function createUser(event){event.preventDefault();setMessage('');try{const result=await api.createPastoralUser({...newUser,brother_id:Number(newUser.brother_id)});setTemporaryPassword(result.temporary_password);setMessage(`Usuario ${result.user.username} criado. Informe a senha temporaria ao usuario.`);setUsers(await api.pastoralUsers())}catch(error){setMessage(error.message)}}

  async function updateUserAccess(id,permissions,active){try{await api.updatePastoralUser(id,{permissions,active});setUsers(await api.pastoralUsers());setMessage('Acesso atualizado.')}catch(error){setMessage(error.message)}}

  async function resetPassword(id){try{const result=await api.resetPastoralUserPassword(id);setTemporaryPassword(result.temporary_password);setMessage('Senha temporaria redefinida.')}catch(error){setMessage(error.message)}}

  async function createAppointment(event){event.preventDefault();try{if(appointmentId)await api.updatePastoralAppointment(appointmentId,{...appointment,brother_id:undefined,status:appointment.status||'scheduled'});else await api.createPastoralAppointment({...appointment,brother_id:Number(appointment.brother_id)});setMessage(appointmentId?'Acompanhamento atualizado; alteracoes de horario foram preservadas no historico.':'Acompanhamento agendado com conteudo reservado.');setAppointmentId(null);setAppointment({...appointment,notes:'',status:'scheduled'});if(canReadAppointments)setAppointments(await api.pastoralAppointments())}catch(error){setMessage(error.message)}}

  async function openSheep(id){try{const profile=await api.pastoralSheepProfile(id);setSheepProfile(profile)}catch(error){setMessage(error.message)}}

  function scheduleSheepFollowup(person){setAppointment({...appointment,brother_id:String(person.id),occurred_on:today(),notes:''});setAppointmentId(null);setSection('appointments')}

  return <div className="brothers-workspace mx-auto grid w-full min-w-0 max-w-6xl gap-4 pb-6"><nav className="brothers-subnav min-w-0 max-w-full" aria-label="Areas da Gestao de Irmaos"><div className="hidden flex-wrap items-center gap-x-5 gap-y-1 border-b border-line/80 dark:border-shalom-gold/10 md:flex" role="tablist" aria-label="Areas da Gestao de Irmaos">{sections.map(([key,label])=><button key={key} type="button" role="tab" aria-selected={section===key} className={`section-text-tab shrink-0 ${section===key?'section-text-tab-active':''}`} onClick={()=>setSection(key)}>{label}</button>)}</div><div className="brothers-mobile-tabs scrollbar-hidden -mx-3 flex w-full min-w-0 max-w-full flex-nowrap gap-5 overflow-x-auto border-b border-line/80 px-3 dark:border-shalom-gold/10 md:hidden" role="tablist" aria-label="Areas da Gestao de Irmaos">{sections.map(([key,label])=><button key={key} type="button" role="tab" aria-selected={section===key} className={`section-text-tab shrink-0 ${section===key?'section-text-tab-active':''}`} onClick={()=>setSection(key)}>{label}</button>)}</div></nav>{message&&<p role="status" className="border-l-2 border-shalom-orange px-3 py-2 text-sm">{message}{temporaryPassword&&<strong className="ml-2 select-all">Senha temporária: {temporaryPassword}</strong>}</p>}

    {section==='overview'&&pastoralHome?.role==='pastor'&&<div className="grid gap-5"><section><p className="mission-muted text-sm">Bem-vindo, {pastoralHome.profile?.preferred_name||pastoralHome.profile?.full_name}</p><h3 className="mt-1 font-display text-2xl font-semibold">Sua missão pastoral</h3></section><section><div className="flex items-center justify-between border-b border-line pb-2 dark:border-shalom-gold/10"><h3 className="font-semibold">Próximos acompanhamentos</h3><button className="min-h-10 px-2 text-sm font-semibold text-shalom-blue dark:text-shalom-gold" onClick={()=>setSection('appointments')}>Ver todos</button></div>{(pastoralHome.upcoming_appointments||[]).map(item=><button key={item.id} className="flex min-h-14 w-full items-center gap-3 border-b border-line/70 py-2 text-left dark:border-shalom-gold/10" onClick={()=>openSheep(item.brother_id)}><span className="min-w-0 flex-1"><strong className="block">{item.preferred_name||item.full_name}</strong><span className="mission-muted text-xs">{item.occurred_on} · {item.start_time||'Horário a definir'}</span></span><span className="text-xs text-shalom-blue dark:text-shalom-gold">Ver perfil</span></button>)}{!(pastoralHome.upcoming_appointments||[]).length&&<p className="mission-muted py-4 text-sm">Nenhum acompanhamento agendado.</p>}</section><section><h3 className="border-b border-line pb-2 font-semibold dark:border-shalom-gold/10">Minhas ovelhas · {(pastoralHome.sheep||[]).length}</h3>{(pastoralHome.sheep||[]).map(person=><div key={person.id} className="flex min-h-14 items-center gap-3 border-b border-line/70 py-2 dark:border-shalom-gold/10"><button className="min-w-0 flex-1 text-left font-medium" onClick={()=>openSheep(person.id)}>{person.preferred_name||person.full_name}</button><button className="mission-btn min-h-10 px-3 text-xs" onClick={()=>scheduleSheepFollowup(person)}>Agendar</button></div>)}</section>{sheepProfile&&<section className="border-l-2 border-shalom-gold pl-3"><h3 className="font-semibold">{sheepProfile.preferred_name||sheepProfile.full_name}</h3><p className="mission-muted mt-1 text-sm">{sheepProfile.community_status||'Situação comunitária não informada'}{sheepProfile.community_joined_on?` · Desde ${sheepProfile.community_joined_on}`:''}</p>{sheepProfile.groups?.length>0&&<p className="mt-2 text-sm">Grupos: {sheepProfile.groups.map(group=>group.name).join(', ')}</p>}<button className="mission-btn mt-2 min-h-10 px-3" onClick={()=>scheduleSheepFollowup(sheepProfile)}>Registrar acompanhamento</button></section>}<section><h3 className="border-b border-line pb-2 font-semibold dark:border-shalom-gold/10">Acompanhamentos realizados</h3>{(pastoralHome.completed_followups||[]).map(item=><p key={item.id} className="border-b border-line/70 py-2 text-sm dark:border-shalom-gold/10">{item.occurred_on} · {item.preferred_name||item.full_name}</p>)}{!(pastoralHome.completed_followups||[]).length&&<p className="mission-muted py-3 text-sm">Nenhum acompanhamento realizado.</p>}</section><section><h3 className="border-b border-line pb-2 font-semibold dark:border-shalom-gold/10">Compromissos pessoais</h3>{(pastoralHome.personal_events||[]).slice(0,6).map(item=><p key={`${item.id}-${item.occurrence_date}`} className="border-b border-line/70 py-2 text-sm dark:border-shalom-gold/10">{item.occurrence_date} · {item.title}{item.start_time?` · ${item.start_time}`:''}</p>)}<button className="min-h-10 px-1 text-sm font-semibold text-shalom-blue dark:text-shalom-gold" onClick={()=>setSection('calendar')}>Organizar agenda</button></section><section><h3 className="border-b border-line pb-2 font-semibold dark:border-shalom-gold/10">Grupos ligados à minha atuação</h3>{(pastoralHome.groups||[]).map(group=><p key={group.id} className="border-b border-line/70 py-2 text-sm dark:border-shalom-gold/10">{group.name}{group.habitual_start_time?` · ${group.habitual_start_time}`:''}{group.location?` · ${group.location}`:''}</p>)}{!(pastoralHome.groups||[]).length&&<p className="mission-muted py-3 text-sm">Nenhum grupo vinculado.</p>}</section><section><h3 className="border-b border-line pb-2 font-semibold dark:border-shalom-gold/10">Eventos da Obra</h3>{(pastoralHome.community_events||[]).slice(0,6).map(item=><p key={`${item.id}-${item.occurrence_date}`} className="border-b border-line/70 py-2 text-sm dark:border-shalom-gold/10"><strong>{item.occurrence_date}</strong> · {item.title}</p>)}</section></div>}

    {section==='overview'&&pastoralHome?.role==='sheep'&&<div className="grid gap-5"><section><p className="mission-muted text-sm">Olá, {pastoralHome.profile?.preferred_name||pastoralHome.profile?.full_name}</p><h3 className="mt-1 font-display text-2xl font-semibold">Sua comunidade</h3><p className="mt-2 text-sm">Pastor responsável: {self?.pastor?.pastor_preferred_name||self?.pastor?.pastor_name||'Sem vínculo ativo'}</p></section><section><h3 className="border-b border-line pb-2 font-semibold dark:border-shalom-gold/10">Seus próximos compromissos</h3>{[...pastoralHome.own_appointments,...pastoralHome.personal_events,...pastoralHome.community_events].sort((a,b)=>(a.occurred_on||a.occurrence_date||'').localeCompare(b.occurred_on||b.occurrence_date||'')).slice(0,8).map(item=><p key={item.id} className="border-b border-line/70 py-2 text-sm dark:border-shalom-gold/10"><strong>{item.occurred_on||item.occurrence_date}</strong> · {item.title||'Acompanhamento pastoral'}{item.start_time?` · ${item.start_time}`:''}</p>)}</section></div>}

    {section==='overview'&&(!pastoralHome?.role||pastoralHome.role==='coordinator')&&<CommunityOverview overview={overview} setSection={setSection}/> }

    {section==='sheep'&&isPastor&&<section><h3 className="font-display text-xl font-semibold">Minhas ovelhas</h3><div className="mt-2 divide-y divide-line/70 dark:divide-shalom-gold/10">{pastoralHome.sheep.map(person=><div key={person.id} className="flex min-h-14 items-center gap-3 py-2"><button className="min-w-0 flex-1 text-left font-medium" onClick={()=>openSheep(person.id)}>{person.preferred_name||person.full_name}</button><button className="mission-btn min-h-10 px-3 text-xs" onClick={()=>scheduleSheepFollowup(person)}>Agendar acompanhamento</button></div>)}</div>{sheepProfile&&<div className="mt-4 border-l-2 border-shalom-gold pl-3"><h4 className="font-semibold">{sheepProfile.preferred_name||sheepProfile.full_name}</h4><p className="mission-muted mt-1 text-sm">{sheepProfile.community_status||'Situação comunitária não informada'}</p><p className="mt-2 text-sm">Grupos: {sheepProfile.groups.map(group=>group.name).join(', ')||'Nenhum grupo ativo'}</p><button className="mission-btn mt-2 min-h-10 px-3" onClick={()=>scheduleSheepFollowup(sheepProfile)}>Registrar acompanhamento</button></div>}</section>}

    {section==='people'&&<BrothersManager user={user} hideSectionNavigation/>}

    {section==='ministries'&&<ServicesManager user={user} people={people}/>}

    {section==='groups'&&<PrayerGroupsManager user={user} services={ministries} people={people}/>}

    {section==='org'&&<OrgChart tree={tree} people={people} user={user} refresh={reloadTree}/>}

    {section==='calendar'&&<CommunityCalendar user={user} groups={groups} ministries={ministries} people={people}/>}

    {section==='appointments'&&<div className="grid gap-4">{canReadAppointments&&<section className="grid gap-2"><h3 className="font-display text-lg font-semibold">Acompanhamentos autorizados</h3>{appointments.map((item)=><article key={item.id} className="grid gap-2 rounded-xl border border-line p-3 dark:border-shalom-gold/20"><strong>{item.full_name} · {item.occurred_on} {item.start_time||''}</strong><span className="text-sm">{item.notes}</span><span className="mission-muted text-xs">{item.status} · {item.location||''}</span>{canUpdateAppointments&&<button className="mission-btn min-h-10 justify-self-start px-3" onClick={()=>{setAppointmentId(item.id);setAppointment({brother_id:String(item.brother_id),occurred_on:item.occurred_on,start_time:item.start_time||'',end_time:item.end_time||'',location:item.location||'',category:item.category,notes:item.notes,status:item.status})}}>Editar / reagendar</button>}</article>)}{appointments.length===0&&<p className="mission-muted text-sm">Nenhum registro disponivel.</p>}</section>}{canCreateAppointments&&<form onSubmit={createAppointment} className="grid gap-3 rounded-2xl border border-line p-4 dark:border-shalom-gold/20 sm:grid-cols-2"><h3 className="font-display text-lg font-semibold sm:col-span-2">{appointmentId?'Editar ou reagendar acompanhamento':'Agendar acompanhamento pastoral privado'}</h3><label className="text-sm">Ovelha<select required disabled={Boolean(appointmentId)} className="mission-input mt-1 h-11 w-full px-3" value={appointment.brother_id} onChange={(e)=>setAppointment({...appointment,brother_id:e.target.value})}><option value="">Selecionar ovelha vinculada</option>{sheep.map((person)=><option key={person.id} value={person.id}>{person.preferred_name||person.full_name}</option>)}</select></label><label className="text-sm">Data<input required type="date" className="mission-input mt-1 h-11 w-full px-3" value={appointment.occurred_on} onChange={(e)=>setAppointment({...appointment,occurred_on:e.target.value})}/></label><label className="text-sm">Inicio<input type="time" className="mission-input mt-1 h-11 w-full px-3" value={appointment.start_time} onChange={(e)=>setAppointment({...appointment,start_time:e.target.value})}/></label><label className="text-sm">Termino<input type="time" className="mission-input mt-1 h-11 w-full px-3" value={appointment.end_time} onChange={(e)=>setAppointment({...appointment,end_time:e.target.value})}/></label><label className="text-sm">Local<input className="mission-input mt-1 h-11 w-full px-3" value={appointment.location} onChange={(e)=>setAppointment({...appointment,location:e.target.value})}/></label>{appointmentId&&<label className="text-sm">Situacao<select className="mission-input mt-1 h-11 w-full px-3" value={appointment.status} onChange={(e)=>setAppointment({...appointment,status:e.target.value})}><option value="scheduled">Agendado</option><option value="completed">Realizado</option><option value="cancelled">Cancelado</option></select></label>}<label className="text-sm sm:col-span-2">Notas privadas<textarea required maxLength="10000" className="mission-input mt-1 min-h-28 w-full px-3 py-2" value={appointment.notes} onChange={(e)=>setAppointment({...appointment,notes:e.target.value})}/></label><p className="mission-muted text-xs sm:col-span-2">As notas so sao retornadas a usuarios autorizados e nunca aparecem no calendario comunitario.</p><div className="flex gap-2"><button className="mission-btn mission-btn-primary min-h-11 px-4">{appointmentId?'Salvar alteracoes':'Agendar'}</button>{appointmentId&&<button type="button" className="mission-btn min-h-11 px-4" onClick={()=>{setAppointmentId(null);setAppointment({...appointment,notes:'',status:'scheduled'})}}>Cancelar edicao</button>}</div></form>}</div>}

    {section==='users'&&perm(user,'brothers:users:manage')&&<div className="grid gap-6"><form onSubmit={createUser} className="grid gap-3 rounded-2xl border border-line p-4 dark:border-shalom-gold/20 sm:grid-cols-2"><h3 className="font-display text-lg font-semibold sm:col-span-2"><UserCog size={19} className="mr-2 inline"/>Criar usuario exclusivo da Gestao de Irmaos</h3><label className="text-sm">Nome de acesso<input required minLength="2" className="mission-input mt-1 h-11 w-full px-3" value={newUser.name} onChange={(e)=>setNewUser({...newUser,name:e.target.value})}/></label><label className="text-sm">Usuario<input required pattern="[a-z0-9._-]{3,40}" className="mission-input mt-1 h-11 w-full px-3" value={newUser.username} onChange={(e)=>setNewUser({...newUser,username:e.target.value.toLowerCase()})}/></label><label className="text-sm sm:col-span-2">Vincular ao cadastro<select required className="mission-input mt-1 h-11 w-full px-3" value={newUser.brother_id} onChange={(e)=>setNewUser({...newUser,brother_id:e.target.value})}><option value="">Selecionar irmao</option>{people.map((p)=><option key={p.id} value={p.id}>{p.preferred_name||p.full_name}</option>)}</select></label><fieldset className="grid gap-2 sm:col-span-2"><legend className="mb-1 text-sm font-semibold">Permissoes do usuario</legend>{brotherPermissionOptions.map((option)=><label key={option.value} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={newUser.permissions.includes(option.value)} onChange={(e)=>setNewUser({...newUser,permissions:e.target.checked?[...newUser.permissions,option.value]:newUser.permissions.filter((p)=>p!==option.value)})}/>{option.label}</label>)}</fieldset><button className="mission-btn mission-btn-primary min-h-11 px-4">Criar usuario</button></form><section className="grid gap-3"><h3 className="font-display text-lg font-semibold">Usuarios exclusivos da Gestao de Irmaos</h3>{users.map((item)=><article key={item.id} className="grid gap-2 rounded-xl border border-line p-3 dark:border-shalom-gold/20"><strong>{item.name} <span className="mission-muted font-normal">@{item.username}</span>{!item.active&&<span className="ml-2 text-xs text-shalom-orange">Inativo</span>}</strong><span className="mission-muted text-sm">Cadastro vinculado: {item.preferred_name||item.full_name||`#${item.brother_id}`}</span><ModuleUserAccess user={item} onSave={updateUserAccess}/><div className="flex flex-wrap gap-2"><button disabled={!item.active} className="mission-btn min-h-10 px-3 disabled:opacity-50" onClick={()=>resetPassword(item.id)}>Redefinir senha</button><button className="mission-btn min-h-10 px-3" onClick={()=>updateUserAccess(item.id,item.permissions,!item.active)}>{item.active?'Desativar acesso':'Reativar acesso'}</button></div></article>)}</section></div>}

  </div>

}

