#!/usr/bin/env python3
"""Patch: rename Terminal→Empresa in fumaca form, use empList select."""
import sys

FILE = 'index.html' if len(sys.argv) < 2 else sys.argv[1]
with open(FILE, 'r', encoding='utf-8') as f:
    s = f.read()

# ─── 1. fumacaForm reset objects (plain JS, same in both sections) ──────────
OLD_FORM = '{terminal:"",om:"",ringelmann:"",local:"",tipoFonte:"estacionaria",dataExecucao:"",observacoes:"",executante:""}'
NEW_FORM = '{empresa:"",om:"",ringelmann:"",local:"",tipoFonte:"estacionaria",dataExecucao:"",observacoes:"",executante:""}'
count = s.count(OLD_FORM)
print(f'fumacaForm resets found: {count}')
assert count >= 4, f'Expected >=4, got {count}'
s = s.replace(OLD_FORM, NEW_FORM)

# ─── 2. Validation ─────────────────────────────────────────────────────────
OLD_VAL = 'if(!fumacaForm.terminal||!fumacaForm.ringelmann||!fumacaForm.local){notify("Preencha Terminal, Nível Ringelmann e Local.","error");return;}'
NEW_VAL = 'if(!fumacaForm.empresa||!fumacaForm.ringelmann||!fumacaForm.local){notify("Preencha Empresa, Nível Ringelmann e Local.","error");return;}'
assert OLD_VAL in s, f'Validation not found'
s = s.replace(OLD_VAL, NEW_VAL)

# ─── 3. Save record (appsrc has leading spaces; appjs compacts them) ────────
# Handle both forms
for old, new in [
    ('    terminal:fumacaForm.terminal,om:fumacaForm.om||"",', '    empresa:fumacaForm.empresa,om:fumacaForm.om||"",'),
    ('terminal:fumacaForm.terminal,om:fumacaForm.om||"",',     'empresa:fumacaForm.empresa,om:fumacaForm.om||"",'),
]:
    if old in s:
        s = s.replace(old, new)
        print(f'Replaced save record: {old[:40]}...')

# ─── 4. History display ──────────────────────────────────────────────────────
OLD_HIST = '<div style={{fontWeight:700,color:"#E2E8F0",fontSize:14}}>{item.terminal||"—"}</div>'
NEW_HIST = '<div style={{fontWeight:700,color:"#E2E8F0",fontSize:14}}>{item.empresa||"—"}</div>'
assert OLD_HIST in s, 'History display not found'
s = s.replace(OLD_HIST, NEW_HIST, 1)

# ─── 5. Edit history button ──────────────────────────────────────────────────
OLD_EDIT = 'setFumacaForm({terminal:item.terminal||"",om:item.om||"",ringelmann:item.ringelmann||"",local:item.local||"",tipoFonte:item.tipoFonte||"estacionaria",dataExecucao:item.dataExecucao||"",observacoes:item.observacoes||"",executante:item.executante||""})'
NEW_EDIT = 'setFumacaForm({empresa:item.empresa||"",om:item.om||"",ringelmann:item.ringelmann||"",local:item.local||"",tipoFonte:item.tipoFonte||"estacionaria",dataExecucao:item.dataExecucao||"",observacoes:item.observacoes||"",executante:item.executante||""})'
assert OLD_EDIT in s, 'Edit history item not found'
s = s.replace(OLD_EDIT, NEW_EDIT, 1)

# ─── 6. appsrc widget ───────────────────────────────────────────────────────
OLD_W = '  <div style={{marginBottom:12}}>\n    <label style={{display:"block",color:"#94A3B8",fontSize:13,marginBottom:4,fontWeight:600}}>Terminal <span style={{color:"#EF4444"}}>*</span></label>\n    <select value={fumacaForm.terminal} onChange={e=>setFumacaForm(f=>({...f,terminal:e.target.value}))}\n      style={{width:"100%",background:"#1E293B",border:"1px solid #334155",borderRadius:8,padding:"8px 12px",color:fumacaForm.terminal?"#E2E8F0":"#64748B",fontSize:14,boxSizing:"border-box",appearance:"auto"}}>\n      <option value="">— Selecione o terminal —</option>\n      {a3Terminals.length>0\n        ?a3Terminals.map(t=><option key={t.sigla} value={t.sigla}>{t.sigla}{t.nome?" — "+t.nome:""}</option>)\n        :<option disabled>Nenhum terminal cadastrado (configure em Análise de Falha)</option>}\n    </select>\n  </div>'
NEW_W = '  <div style={{marginBottom:12}}>\n    <label style={{display:"block",color:"#94A3B8",fontSize:13,marginBottom:4,fontWeight:600}}>Empresa <span style={{color:"#EF4444"}}>*</span></label>\n    <div className="input-wrap"><span className="input-icon"><PMIcon n="building" s={16}/></span>\n    <select className="input-field" style={{paddingLeft:40}} value={fumacaForm.empresa} onChange={e=>setFumacaForm(f=>({...f,empresa:e.target.value}))}>\n      <option value="">— Selecione —</option>\n      {fumacaForm.empresa&&!empList.some(x=>x.descEmpresa===fumacaForm.empresa)&&<option value={fumacaForm.empresa}>{fumacaForm.empresa}</option>}\n      {empList.map(emp=><option key={emp.id} value={emp.descEmpresa}>{emp.descEmpresa}</option>)}\n    </select></div>\n    <button type="button" onClick={()=>{setEmpForm(EMP_BLANK);setEmpEditId(null);setShowEmpModal(true)}} style={{marginTop:6,background:"none",border:"none",color:"#60A5FA",fontSize:11,fontWeight:600,cursor:"pointer",padding:0}}>⚙ Cadastrar empresa</button>\n  </div>'
assert OLD_W in s, 'appsrc terminal widget not found'
s = s.replace(OLD_W, NEW_W, 1)
print('Replaced appsrc widget')

# ─── 7. appjs: label and compiled select ────────────────────────────────────
APPSRC_IDX = s.index('<script type="text/babel" id="appsrc">')
appjs_part = s[:APPSRC_IDX]
appsrc_part = s[APPSRC_IDX:]

if '"Terminal ",' in appjs_part:
    appjs_part = appjs_part.replace('"Terminal ",', '"Empresa ",', 1)
    print('Replaced appjs label')

OLD_JS = 'createElement("select",{value:fumacaForm.terminal,onChange:e=>setFumacaForm(f=>({...f,terminal:e.target.value})),style:{width:"100%",background:"#1E293B",border:"1px solid #334155",borderRadius:8,padding:"8px 12px",color:fumacaForm.terminal?"#E2E8F0":"#64748B",fontSize:14,boxSizing:"border-box",appearance:"auto"}},React.createElement("option",{value:""},"— Selecione o terminal —"),a3Terminals.length>0?a3Terminals.map(t=>React.createElement("option",{key:t.sigla,value:t.sigla},t.sigla,t.nome?" — "+t.nome:"")):React.createElement("option",{disabled:!0},"Nenhum terminal cadastrado (configure em Análise de Falha)"))'
NEW_JS = 'React.createElement("div",{className:"input-wrap"},React.createElement("span",{className:"input-icon"},React.createElement(PMIcon,{n:"building",s:16})),React.createElement("select",{className:"input-field",style:{paddingLeft:40},value:fumacaForm.empresa,onChange:e=>setFumacaForm(f=>({...f,empresa:e.target.value}))},React.createElement("option",{value:""},"— Selecione —"),fumacaForm.empresa&&!empList.some(x=>x.descEmpresa===fumacaForm.empresa)&&React.createElement("option",{value:fumacaForm.empresa},fumacaForm.empresa),empList.map(emp=>React.createElement("option",{key:emp.id,value:emp.descEmpresa},emp.descEmpresa)))),React.createElement("button",{type:"button",onClick:()=>{setEmpForm(EMP_BLANK);setEmpEditId(null);setShowEmpModal(!0)},style:{marginTop:6,background:"none",border:"none",color:"#60A5FA",fontSize:11,fontWeight:600,cursor:"pointer",padding:0}},"⚙ Cadastrar empresa")'
if OLD_JS in appjs_part:
    appjs_part = appjs_part.replace(OLD_JS, NEW_JS, 1)
    print('Replaced appjs compiled select')
else:
    print('Compiled select exact match not found, using fallback')
    appjs_part = appjs_part.replace('"— Selecione o terminal —"', '"— Selecione —"')
    appjs_part = appjs_part.replace('a3Terminals.length>0?a3Terminals.map(t=>React.createElement("option",{key:t.sigla,value:t.sigla},t.sigla,t.nome?" — "+t.nome:"")):React.createElement("option",{disabled:!0},"Nenhum terminal cadastrado (configure em Análise de Falha)")', 'empList.map(emp=>React.createElement("option",{key:emp.id,value:emp.descEmpresa},emp.descEmpresa))')

# ─── 8. Final cleanup: any remaining fumacaForm.terminal in appjs ────────────
remaining = appjs_part.count('fumacaForm.terminal')
print(f'Remaining fumacaForm.terminal in appjs before cleanup: {remaining}')
if remaining > 0:
    # First fix value references: fumacaForm.terminal -> fumacaForm.empresa
    appjs_part = appjs_part.replace('fumacaForm.terminal', 'fumacaForm.empresa')
    print('Replaced remaining fumacaForm.terminal')

# Fix any key:value pairs where key still says terminal but value now says empresa
# e.g. terminal:fumacaForm.empresa -> empresa:fumacaForm.empresa
appjs_part = appjs_part.replace('terminal:fumacaForm.empresa', 'empresa:fumacaForm.empresa')

s = appjs_part + appsrc_part

# ─── Parity checks ──────────────────────────────────────────────────────────
parity = [
    ('fumacaList', True),
    ('fumacaInspecoes', True),
    ('CARTÃO RINGELMANN', True),
    ('fumacaForm.empresa', True),
    ('empList.map(emp=>', True),
    ('setEmpForm(EMP_BLANK)', True),
    ('empresa:fumacaForm.empresa', True),
    ('fumacaForm.terminal', False),  # must NOT exist
]
ok = True
for text, should_exist in parity:
    found = text in s
    passed = found == should_exist
    print(f'{"OK" if passed else "FAIL"} {text!r}: found={found}, expected={should_exist}')
    if not passed:
        ok = False
if not ok:
    sys.exit(1)

with open(FILE, 'w', encoding='utf-8') as f:
    f.write(s)
print('Done.')
