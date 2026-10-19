# NowPlace — SA2

Projeto front-end em HTML, CSS e **um único arquivo JavaScript**.

## Arquivos

- `index.html` — estrutura da interface
- `style.css` — visual responsivo
- `script.js` — câmera, captura das duas fotos, localização, consulta de endereço via `fetch`, API, Storage, regra das 24 horas e feed

## Executar no Windows

1. Extraia o ZIP.
2. Abra a pasta no VS Code.
3. Abra o terminal dentro desta pasta e execute:

```powershell
py -m http.server 5500
```

4. Acesse http://localhost:5500.
5. Permita o acesso à câmera e à localização.

Não é necessário executar `npm install`, nem iniciar uma API própria.

## API

O app tenta primeiro a API solicitada na atividade (`https://api.jsonplaceholder.dev/posts`) e usa `https://jsonplaceholder.typicode.com/posts` como alternativa. A API recebe um POST de demonstração. As publicações com as fotos reais e coordenadas também são guardadas no `localStorage`, porque as APIs JSONPlaceholder são para testes e não garantem persistência permanente. Se a API não responder, o Now ainda é salvo localmente e aparece no feed do mesmo navegador.

## Regra e feed

O feed é liberado durante 24 horas a partir de uma publicação. Os Nows do usuário atual ficam visíveis no feed próprio; os Nows dos outros usuários são filtrados pelo raio escolhido. Se o GPS não puder ser lido depois da publicação, o app usa a localização da última publicação local para exibir os Nows salvos neste dispositivo.

## Limitação importante

O `localStorage` é local ao navegador e dispositivo. Para partilhar fotografias reais entre dispositivos diferentes, seria necessário um serviço que armazene imagens e publicações de forma persistente; a JSONPlaceholder é uma API de demonstração e não substitui esse serviço.
