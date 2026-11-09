<div align="center">

# 🛡️ bekci

**AI agent'ınızın gece bekçisi.**

Skill'leri, MCP server'ları, hook'ları, izinleri ve kural dosyalarını tarar; prompt injection,<br>
kimlik bilgisi hırsızlığı ve tedarik zinciri saldırılarını makinenizde çalışmadan önce yakalar.

```bash
npx bekci
```

<img src="assets/demo.svg" alt="bekci zararlı bir Claude Code eklentisini tarıyor" width="860">

[English](README.md) · [Kurallar](docs/rules.md)

</div>

---

## Neden?

Coding agent'larına shell'inizi, SSH anahtarlarınızı ve token'larınızı veriyorsunuz. Sonra onları tanımadığınız kişilerin yazdığı skill'ler, plugin'ler ve MCP server'larıyla genişletiyorsunuz.

- **Skill'ler kod ve talimattan oluşur.** Bir `SKILL.md` görünmez Unicode karakterlerle talimat saklayabilir. Beraberinde gelen script'ler de sizin yetkilerinizle çalışır.
- **MCP server'lar kendiliğinden güncellenir.** `npx -y bir-server` her açılışta en son yayınlanan sürümü çalıştırır. Ele geçirilmiş tek bir sürüm herkese ulaşır.
- **Zararsız server'lar birleşince istismar oluşur.** Özel veri, güvenilmeyen içerik ve dışarı veri gönderme yeteneği aynı agent'ta toplanırsa tek bir prompt injection veri sızdırmaya yeter. Buna "lethal trifecta" deniyor.
- **Repolar agent config'iyle birlikte gelir.** Klonladığınız bir proje, hiç incelemediğiniz hook'ları, MCP server'ları ve talimat dosyalarını da beraberinde getirebilir.

`bekci` bunların hepsini internete çıkmadan ve API anahtarı gerektirmeden saniyeler içinde tarar, neyi düzeltmeniz gerektiğini söyler.

## Hızlı başlangıç

```bash
npx bekci                                   # makinedeki agent config'i + bulunduğun proje
npx bekci github:kullanici/skill-reposu     # kurmadan ÖNCE bir repoyu tara
npx bekci ./proje --no-user                 # sadece proje (CI'ın gördüğü)
```

## Neleri yakalar?

26 kural: görünmez Unicode ile gizlenmiş talimatlar (çözülüp gösterilir), "önceki talimatları yok say" kalıpları, `curl | bash`, SSH anahtarı okuyup dışarı gönderen script'ler, düz metin API anahtarları, `bypassPermissions` ve `Bash(*)` izinleri, sürümü sabitlenmemiş veya typosquat MCP paketleri, ayrıcalıklı Docker container'ları ve "lethal trifecta". Tam liste: [docs/rules.md](docs/rules.md).

**Desteklenen agent'lar:** Claude Code, Codex, Cursor, Gemini CLI, Claude Desktop, VS Code / Copilot, Windsurf, Cline ve tüm Agent Skills klasörleri.

## CI

```yaml
- uses: YusufSizmaz/bekci@v0.1.0
  with:
    fail-on: high
```

Sonuçlar SARIF olarak GitHub code scanning'e yüklenir ve iş özetine bir tablo yazılır.

## İlkeler

- **Tamamen çevrimdışı:** Ağ çağrısı, telemetri ya da LLM yok.
- **Sıfır runtime bağımlılığı:** Tedarik zinciri tarayıcısının kendisi bir tedarik zinciri riski olmamalı.
- **Secret'ları asla tam göstermez:** Her çıktı formatında maskelenir.
- **Deterministik ve hızlı:** Aynı girdi her zaman aynı sonucu verir.

## İsim

*Bekçi*, mahallede gece devriye gezip kapıların kilitli olup olmadığına bakan, bir terslik görünce düdüğünü öttüren kişidir. Bu aracın işi de bu.

## Lisans

[MIT](LICENSE) © Yusuf Sizmaz
