# Extensão Chromium

O popup resolve o hostname pela API e só ativa inspeção em projeto permitido. IDs: UUID persistente em `chrome.storage.local` e UUID de sessão em `chrome.storage.session`; nenhum concede permissão.

O content script usa `composedPath`, outline fixed e Shadow DOM para não mexer no layout. Clique original é interrompido e Escape cancela. Elementos estruturais, invisíveis, sem dimensão, iframes, inputs e áreas sensíveis são recusados.

Captura: contexto DOM sanitizado → background `captureVisibleTab` → crop por bounding box × DPR em `OffscreenCanvas` → API. Se captura/crop falhar, o feedback continua sem a imagem correspondente. Elementos parcialmente fora da viewport são recortados ao limite visível.

Marcadores consultam somente o endpoint público mínimo, tentam o selector e usam posição salva com estilo de órfão. Atualizam em scroll/resize. Limitações: cross-origin iframe, closed Shadow DOM, páginas `chrome://`, selector atravessando shadow root e páginas que mudam DOM agressivamente.
