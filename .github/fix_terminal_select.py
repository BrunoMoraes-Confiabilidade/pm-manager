#!/usr/bin/env python3
# Patches index.html: replaces <input list="fumaca-terminals"> with <select>
with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

changed = False

# Fix 1: compiled appjs
OLD_APPJS = (
    'createElement("input",{list:"fumaca-terminals",'
    'value:fumacaForm.terminal,'
    'onChange:e=>setFumacaForm(f=>({...f,terminal:e.target.value})),'
    'placeholder:"Selecione ou digite o terminal",'
    'style:{width:"100%",background:"#1E293B",'
    'border:"1px solid #334155",borderRadius:8,'
    'padding:"8px 12px",color:"#E2E8F0",fontSize:14,'
    'boxSizing:"border-box"}}),'
    'React.createElement("datalist",{id:"fumaca-terminals"},'
    'a3Terminals.map(t=>React.createElement("option",'
    '{key:t.sigla,value:t.sigla},t.nome)))'
)
NEW_APPJS = (
    'createElement("select",{value:fumacaForm.terminal,'
    'onChange:e=>setFumacaForm(f=>({...f,terminal:e.target.value})),'
    'style:{width:"100%",background:"#1E293B",'
    'border:"1px solid #334155",borderRadius:8,'
    'padding:"8px 12px",'
    'color:fumacaForm.terminal?"#E2E8F0":"#64748B",fontSize:14,'
    'boxSizing:"border-box",appearance:"auto"}},'
    'React.createElement("option",{value:""},"— Selecione o terminal —"),'
    'a3Terminals.length>0?a3Terminals.map(t=>React.createElement("option",'
    '{key:t.sigla,value:t.sigla},t.sigla,t.nome?" — "+t.nome:""))'
    ':React.createElement("option",{disabled:!0},'
    '"Nenhum terminal cadastrado (configure em Análise de Falha)"))'
)

if OLD_APPJS in content:
    content = content.replace(OLD_APPJS, NEW_APPJS, 1)
    print('OK appjs fix applied')
    changed = True
else:
    print('INFO appjs already patched or string not found')

# Fix 2: appsrc JSX
OLD_APPSRC = (
    '    <input list="fumaca-terminals" value={fumacaForm.terminal} '
    'onChange={e=>setFumacaForm(f=>({...f,terminal:e.target.value}))} '
    'placeholder="Selecione ou digite o terminal"\n'
    '      style={{width:"100%",background:"#1E293B",'
    'border:"1px solid #334155",borderRadius:8,'
    'padding:"8px 12px",color:"#E2E8F0",fontSize:14,'
    'boxSizing:"border-box"}}/>\n'
    '    <datalist id="fumaca-terminals">'
    '{a3Terminals.map(t=><option key={t.sigla} value={t.sigla}>'
    '{t.nome}</option>)}</datalist>'
)
NEW_APPSRC = (
    '    <select value={fumacaForm.terminal} '
    'onChange={e=>setFumacaForm(f=>({...f,terminal:e.target.value}))}\n'
    '      style={{width:"100%",background:"#1E293B",'
    'border:"1px solid #334155",borderRadius:8,'
    'padding:"8px 12px",'
    'color:fumacaForm.terminal?"#E2E8F0":"#64748B",fontSize:14,'
    'boxSizing:"border-box",appearance:"auto"}}>\n'
    '      <option value="">— Selecione o terminal —</option>\n'
    '      {a3Terminals.length>0\n'
    '        ?a3Terminals.map(t=><option key={t.sigla} value={t.sigla}>'
    '{t.sigla}{t.nome?" — "+t.nome:""}</option>)\n'
    '        :<option disabled>Nenhum terminal cadastrado '
    '(configure em Análise de Falha)</option>}\n'
    '    </select>'
)

if OLD_APPSRC in content:
    content = content.replace(OLD_APPSRC, NEW_APPSRC, 1)
    print('OK appsrc fix applied')
    changed = True
else:
    print('INFO appsrc already patched or string not found')

if changed:
    with open('index.html', 'w', encoding='utf-8') as f:
        f.write(content)
    print('DONE index.html written')
else:
    print('NO_CHANGES nothing to do')
