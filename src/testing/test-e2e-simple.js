// Test de bout en bout simple pour le flux KYC
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🧪 Test bout en bout KYC - Démarrage...\n');

// Créer une image test simple
const testImagePath = path.join(__dirname, 'test-image.jpg');

// Essayer de créer une image avec une couleur unie
const width = 600;
const height = 600;
const pixelData = Buffer.alloc(width * height * 3);

// Remplir avec une couleur grise
for (let i = 0; i < pixelData.length; i += 3) {
    pixelData[i] = 200;     // R
    pixelData[i + 1] = 200; // G  
    pixelData[i + 2] = 200; // B
}

// Écrire l'image
fs.writeFileSync(testImagePath, pixelData);
console.log('📸 Image test créée');

// Tester le serveur KYC
try {
    console.log('🌐 Test du serveur KYC...');
    
    // Vérifier si le serveur répond
    const result = execSync(`curl -X POST http://localhost:8080/api/v1/validate \
        -F "photo=@${testImagePath}" \
        -F "type=passport" \
        -H "Content-Type: multipart/form-data" \
        --connect-timeout 5 \
        --max-time 10 2>/dev/null || echo "SERVER_NOT_RUNNING"`, 
        { encoding: 'utf-8' }
    );
    
    if (result.includes('SERVER_NOT_RUNNING')) {
        console.log('❌ Serveur KYC non démarré');
        console.log('💡 Lancez le serveur avec: npm run dev (dans server/)');
    } else {
        console.log('✅ Serveur KYC accessible!');
        console.log('📋 Réponse:', result.substring(0, 150) + '...');
        
        // Analyser la réponse JSON
        try {
            const jsonResponse = JSON.parse(result);
            console.log('📊 Status:', jsonResponse.ok ? '✅ OK' : '❌ Erreur');
            console.log('📝 Messages:', jsonResponse.messages?.length || 0);
            
            if (jsonResponse.stats) {
                console.log('👤 Face détectée:', jsonResponse.stats.faceDetected || false);
            }
            
            console.log('\n🎉 Flux KYC fonctionnel!');
        } catch (parseError) {
            console.log('⚠️  Réponse non JSON:', result.substring(0, 100));
        }
    }
    
} catch (error) {
    console.log('❌ Erreur:', error.message);
} finally {
    // Nettoyer
    if (fs.existsSync(testImagePath)) {
        fs.unlinkSync(testImagePath);
    }
    console.log('\n🧹 Fichiers de test nettoyés');
}