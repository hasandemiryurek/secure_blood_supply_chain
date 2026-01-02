# IPFS Entegrasyonu Rehberi

## 🌐 IPFS Nedir?

IPFS (InterPlanetary File System), merkezi olmayan bir dosya depolama sistemidir. Blood Cold Chain projesinde şu amaçlarla kullanılır:

- 📄 **Sertifikalar**: Donör sertifikaları, kalite belgeleri
- 🔬 **Test Sonuçları**: Kan testi raporları
- 📷 **Fotoğraflar**: Kan torbası fotoğrafları
- 📊 **Raporlar**: Detaylı JSON meta verileri

## ⚙️ Kurulum

### 1. Bağımlılıkları Yükleyin

```bash
npm install
```

### 2. IPFS Sağlayıcısı Seçin

`.env` dosyasında IPFS_PROVIDER değişkenini ayarlayın:

```env
IPFS_PROVIDER=pinata  # Önerilen
```

### 3. API Anahtarlarını Yapılandırın

#### Pinata (Önerilen - Ücretsiz Plan Mevcut)

1. [Pinata'ya kaydolun](https://app.pinata.cloud)
2. API Keys bölümünden yeni bir anahtar oluşturun
3. `.env` dosyasına ekleyin:

```env
PINATA_API_KEY=your_api_key
PINATA_SECRET_KEY=your_secret_key
```

#### NFT.Storage (Tamamen Ücretsiz)

1. [NFT.Storage'a kaydolun](https://nft.storage)
2. API Keys bölümünden anahtar alın
3. `.env` dosyasına ekleyin:

```env
IPFS_PROVIDER=nft.storage
NFT_STORAGE_KEY=your_key
```

#### Infura IPFS

1. [Infura'ya kaydolun](https://infura.io)
2. Yeni bir IPFS projesi oluşturun
3. `.env` dosyasına ekleyin:

```env
IPFS_PROVIDER=infura
INFURA_PROJECT_ID=your_project_id
INFURA_PROJECT_SECRET=your_secret
```

#### Lokal IPFS Node

1. [IPFS Desktop](https://docs.ipfs.tech/install/ipfs-desktop/) yükleyin
2. veya terminal'de: `ipfs daemon`
3. `.env` dosyasını ayarlayın:

```env
IPFS_PROVIDER=local
```

## 🚀 Kullanım

### Frontend Üzerinden

1. **Register Donation** sekmesinde dosya yükleyebilirsiniz
2. **IPFS Documents** sekmesinde:
   - Mevcut belgeleri görüntüleyin
   - Yeni belgeler yükleyin

### API Endpoint'leri

```bash
# IPFS durumunu kontrol et
GET /api/ipfs/status

# Dosya yükle
POST /api/ipfs/upload
- Form Data: file, bagId, documentType

# JSON yükle
POST /api/ipfs/upload-json
- Body: { data: {...}, name: "filename.json" }

# Kan torbası meta verisi yükle
POST /api/ipfs/upload-bag-metadata
- Body: { bagId, bloodType, ... }

# IPFS'ten içerik al
GET /api/ipfs/content/:hash
GET /api/ipfs/json/:hash

# Blockchain'e IPFS belgesi ekle
POST /api/bags/:bagId/ipfs-document
- Body: { ipfsHash, documentType, signer }

# Kan torbası belgelerini listele
GET /api/bags/:bagId/ipfs-documents

# Tek adımda yükle ve blockchain'e kaydet
POST /api/bags/:bagId/upload-document
- Form Data: file, documentType, signer
```

## 📦 Smart Contract Fonksiyonları

```solidity
// IPFS belgesi ekle
function addIPFSDocument(
    string memory _bagId,
    string memory _ipfsHash,
    string memory _documentType
) external;

// Ana IPFS hash'ini güncelle
function updateIPFSHash(
    string memory _bagId,
    string memory _newIpfsHash
) external;

// Belgeleri getir
function getIPFSDocuments(string memory _bagId) 
    external view returns (IPFSDocument[] memory);

// Ana hash'i getir
function getIPFSHash(string memory _bagId) 
    external view returns (string memory);
```

## 🔗 Gateway URL'leri

IPFS içerikleri şu gateway'lerden erişilebilir:

- **Cloudflare**: `https://cloudflare-ipfs.com/ipfs/{hash}`
- **Pinata**: `https://gateway.pinata.cloud/ipfs/{hash}`
- **Dweb**: `https://dweb.link/ipfs/{hash}`
- **NFT.Storage**: `https://{hash}.ipfs.nftstorage.link`

## 📝 Örnek Kullanım

### Donasyon Kaydı (IPFS ile)

```javascript
// Frontend'den
const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('bagId', 'BAG-001');
formData.append('documentType', 'certificate');

const response = await fetch('/api/bags/BAG-001/upload-document', {
    method: 'POST',
    body: formData
});

const result = await response.json();
console.log('IPFS Hash:', result.ipfs.hash);
console.log('TX Hash:', result.blockchain.txHash);
```

### Meta Veri Oluşturma

```javascript
// Kan torbası meta verisi
const metadata = {
    name: "Blood Bag BAG-001",
    bloodBag: {
        id: "BAG-001",
        bloodType: "A+",
        donationDate: "2024-12-24",
        expiryDate: "2025-02-04"
    },
    testResults: [
        { test: "HIV", result: "Negative" },
        { test: "Hepatitis B", result: "Negative" }
    ],
    certificates: ["QmHash1", "QmHash2"]
};

const response = await fetch('/api/ipfs/upload-bag-metadata', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metadata)
});
```

## ⚠️ Önemli Notlar

1. **Blockchain'de sadece hash saklanır**: Dosyalar IPFS'te, hash'ler blockchain'de
2. **Dosyalar kalıcıdır**: IPFS'e yüklenen dosyalar silinemez
3. **Gateway limitleri**: Ücretsiz gateway'lerin bant genişliği limitleri olabilir
4. **Dosya boyutu**: Büyük dosyalar için pin servisi önerilir

## 🔧 Sorun Giderme

### "IPFS not configured" hatası
- `.env` dosyasındaki API anahtarlarını kontrol edin
- `IPFS_PROVIDER` değişkeninin doğru ayarlandığından emin olun

### "Gateway timeout" hatası
- Alternatif gateway deneyin
- Dosyanın pin'lendiğinden emin olun

### Dosya görüntülenmiyor
- Gateway'in dosyayı indekslemesi zaman alabilir
- Farklı bir gateway URL'si deneyin
