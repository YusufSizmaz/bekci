<div align="center">

# 🛡️ bekci

**AI agent'ınızın gece bekçisi.**

Skill'leri, plugin'leri, MCP server'ları, hook'ları, izinleri ve kural dosyalarını tarar; prompt injection,<br>
kimlik bilgisi hırsızlığı ve tedarik zinciri saldırılarını makinenizde çalışmadan önce yakalar.

[![npm](https://img.shields.io/npm/v/bekci?color=8839ef&label=npm)](https://www.npmjs.com/package/bekci)
[![CI](https://github.com/YusufSizmaz/bekci/actions/workflows/ci.yml/badge.svg)](https://github.com/YusufSizmaz/bekci/actions/workflows/ci.yml)
[![dependencies](https://img.shields.io/badge/dependencies-0-40a02b)](package.json)
[![license](https://img.shields.io/github/license/YusufSizmaz/bekci?color=1e66f5)](LICENSE)

```bash
npx bekci
```

<img src="assets/demo.svg" alt="bekci zararlı bir Claude Code eklentisini tarıyor" width="860">

[Hızlı başlangıç](#hızlı-başlangıç) · [Neleri yakalar](#neleri-yakalar) · [CI](#ci--github-action) · [Kurallar](docs/rules.md) · [Nasıl çalışır](docs/architecture.md) · [English](README.md)

</div>

---

## Neden?

Coding agent'ları shell'inizle, SSH anahtarlarınızla ve token'larınızla çalışır. Onları da çoğu zaman bir README'den kopyalanmış tek satırlık bir `npx` komutuyla, tanımadığınız kişilerin yazdığı skill, plugin ve MCP server'larla genişletiyorsunuz.

Bu katman artık bir saldırı yüzeyi:

- **Skill'ler kod ve talimattan oluşur.** Bir `SKILL.md`, GitHub'ın hiç göstermediği görünmez Unicode karakterlerle talimat saklayabilir. Beraberinde gelen script'ler de sizin yetkilerinizle çalışır.
- **MCP server'lar kendiliğinden güncellenir.** `npx -y bir-server` her açılışta en son yayınlanan sürümü çalıştırır. Bu [yaşandı](https://thehackernews.com/2025/09/first-malicious-mcp-server-found.html): `postmark-mcp` paketi 1.0.16 sürümüne kadar normal davrandı, bu sürümle birlikte gönderilen her e-postanın gizli kopyasını saldırgana yollamaya başladı.
- **Zararsız server'lar birleşince istismar oluşur.** Herkese açık issue'ları okuyup özel repolara yazabilen bir GitHub server'ı, tek bir kötü niyetli issue ile [özel kodun sızmasına](https://invariantlabs.ai/blog/mcp-github-vulnerability) yetti. Simon Willison bu duruma [lethal trifecta](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/) diyor.
- **Repolar agent config'iyle birlikte gelir.** Klonladığınız bir proje, hiç incelemediğiniz hook'ları, MCP server'ları ve `CLAUDE.md` / `.cursorrules` talimatlarını da beraberinde getirebilir.

bekci bunların hepsini ağa çıkmadan ve API anahtarı gerektirmeden yaklaşık bir saniyede okur ve neyi düzeltmeniz gerektiğini söyler.

## Hızlı başlangıç

```bash
# Makineniz: kullanıcı düzeyindeki agent config'i + bulunduğunuz proje
npx bekci

# Bir skill, plugin ya da MCP reposunu kurmadan ÖNCE kontrol edin
npx bekci github:kullanici/skill-reposu
npx bekci https://github.com/kullanici/repo/tree/main/skills/pdf

# Tek bir proje, CI'ın gördüğü haliyle
npx bekci ./proje --no-user
```

Node.js 18.18 veya üstü gerekir. Exit code `0`: `--fail-on` seviyesinde (varsayılan `high`) veya üstünde bulgu yok. `1`: bulgu var. `2`: kullanım hatası veya eksik kalan tarama.

## Neleri yakalar?

Yedi grupta **28 kural**. Her kural [docs/rules.md](docs/rules.md) içinde açıklanır; `bekci explain <id>` ile terminalden de okunabilir.

| | Örnekler |
| --- | --- |
| 🕵️ **Prompt injection** | Görünmez Unicode tag karakterleri (çözülüp size gösterilir), bidi ve sıfır genişlikli karakter hileleri, görünmez karakterle bölünmüş ya da Kiril benzer harflerle yazılmış olsa bile "ignore previous instructions", "kullanıcıya söyleme", HTML yorumlarına gizlenmiş talimatlar, her görevde çalışmayı talep eden skill'ler |
| 💥 **Kod çalıştırma** | Tüm yazımlarıyla `curl … \| bash`, `bash <(curl …)`, `eval "$(curl …)"`, `base64 -d \| sh`, `exec(urlopen(…).read())`, `rm -rf ~` |
| 📤 **Veri sızdırma** | `~/.ssh`, bulut kimlik bilgileri, tarayıcı şifreleri, Keychain ya da kripto cüzdan okumaları; webhook.site, ngrok, Discord/Telegram webhook'ları; **ikisini birden yapan dosyalar** (kritik) |
| 🔑 **Secret'lar** | 30'dan fazla token formatı (Anthropic, OpenAI, GitHub, AWS, Slack, Stripe, …) ve MCP config'lerindeki düz metin `*_API_KEY` / `Authorization` değerleri. Çıktıda her zaman maskelenir |
| 🔓 **İzinler** | `bypassPermissions`, Codex'te `approval_policy = "never"` ile birlikte `danger-full-access`, `Bash(*)`, `Bash(curl:*)`, `enableAllProjectMcpServers`, Gemini `trust: true`, otomatik onaylanan araçlar, proje hook'ları |
| 📦 **Tedarik zinciri** | Sürümü sabitlenmemiş `npx`/`uvx`/`docker` server'ları (`cmd /c` ya da `sh -c` arkasında olsa bile), popüler MCP paketlerinin typosquat'ları, düz HTTP ile bağlanan uzak server'lar, `--privileged` container'lar ve Docker socket bağlamaları, tüm home dizinine erişim, skill içinde derlenmiş binary'ler, aşırı büyük veya ayrıştırılamayan agent dosyaları |
| ☠️ **Zehirli akışlar** | Lethal trifecta: bir agent'ta etkin olan MCP server'ların toplamında özel veri + güvenilmeyen içerik + dışarı çıkış yolu |

Agent neyi okuyorsa onu okur: `SKILL.md` **ve** yanındaki referans dokümanlar ile script'ler, `plugin.json` ve gösterdiği dosyalar, `CLAUDE.md`'nin `@import` ile içeri aldığı dosyalar.

**Desteklenen agent'lar:** Claude Code, Codex, Cursor, Gemini CLI, Claude Desktop, VS Code / Copilot, Windsurf, Cline, ayrıca `AGENTS.md` ve tüm Agent Skills klasörleri. Hangi dosyaların tarandığının tam listesi [İngilizce README](README.md#supported-agents)'de.

## CI / GitHub Action

```yaml
# .github/workflows/bekci.yml
name: bekci
on: [push, pull_request]

permissions:
  contents: read
  actions: read          # private repolarda code scanning için gerekli
  security-events: write # sonuçları code scanning uyarısı olarak yükler

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: YusufSizmaz/bekci@v0.1.2
        with:
          fail-on: high # critical | high | medium | low | none
```

Action, iş sayfasına bir özet tablosu yazar ve SARIF yükler. Böylece bulgular doğru satırlarda code scanning uyarısı olarak görünür. Çıktıları: `grade`, `score`, `findings`. Diğer CI sistemlerinde:

```bash
npx bekci@0.1.2 . --no-user -o bekci.sarif -o bekci.json -o bekci.md
```

## Yapılandırma

Taranan dizinde isteğe bağlı bir `.bekci.json` (veya `bekci.config.json`) dosyası kullanılabilir. Yorum satırları desteklenir:

```jsonc
{
  "ignore": ["BK201"],              // kural ID'leri veya adları
  "ignorePaths": ["examples/**"],   // glob desenleri
  "minSeverity": "low",
  "failOn": "high"
}
```

Kendi dosyalarınızda incelediğiniz bir bulguyu susturmak için aynı satıra `bekci-ignore`, bir önceki satıra `bekci-ignore-next-line` ekleyin; isterseniz ardından kural ID'lerini yazabilirsiniz. İncelenen dosya bir saldırgan tarafından yazılmış olabileceği için bunun sınırları var:

- **Kritik bulgular satır içi yorumla susturulamaz.**
- **Satır içi yorumlar yalnızca projenin kendi dosyalarında geçerlidir.** Skill, plugin veya dışarıdan gelen başka içerikte geçerli değildir.
- **Uzaktan taramalar (`github:…`) hedef reponun `.bekci.json` dosyasını ve satır içi yorumlarını yok sayar.** Symlink'leri takip etmez; `git`'i global ayarlarınız, hook'larınız ve filtreleriniz devre dışı bırakılmış halde çalıştırır.

Tüm CLI seçenekleri için `bekci --help`.

## İlkeler

- **Çevrimdışı ve gizli:** Ağ çağrısı, telemetri ya da LLM yok. Tek ağ erişimi, `github:…` ile sizin istediğiniz `git clone` işlemidir.
- **Sıfır runtime bağımlılığı:** Tedarik zinciri tarayıcısının kendisi bir tedarik zinciri riski olmamalı.
- **Taradığı içeriğe karşı sertleştirilmiş:** Taranan dosyalar düşmanca girdi kabul edilir. Her savunmanın [test/hardening.test.ts](test/hardening.test.ts) içinde bir saldırı testi vardır; tehdit modeli [docs/architecture.md](docs/architecture.md) dosyasındadır.
- **Az gürültü:** Kurallar gerçek kurulumlar ve popüler public skill repoları üzerinde ayarlandı. Bulunan her yanlış pozitif bir regresyon testine dönüşür.

bekci statik bir analiz aracıdır. Bilinen teknikleri ve riskli yapılandırmaları yakalar, ama bir skill'in güvenli olduğunu kanıtlayamaz. Temiz bir rapor "bariz bir sorun yok" demektir, garanti değildir.

## Katkı

En değerli katkı yeni tespit kurallarıdır. [CONTRIBUTING.md](CONTRIBUTING.md) ile başlayın. bekci'nin kendisindeki güvenlik açıklarını lütfen [SECURITY.md](SECURITY.md)'de anlatıldığı gibi gizli olarak bildirin.

## İsim

*Bekçi*, gece mahallede devriye gezip kapıların kilitli olup olmadığına bakan, bir terslik görünce düdüğünü öttüren kişidir. Bu aracın işi de bu.

## Lisans

[MIT](LICENSE) © Yusuf Sizmaz
