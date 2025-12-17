/**
 * Widget Minification Script
 * 
 * Minifies theqah-widget.js and theqah-stars.js for production
 * Target: <20KB minified (currently ~40KB)
 * 
 * Usage: node scripts/minify-widgets.js
 */

const fs = require('fs');
const path = require('path');
const { minify } = require('terser');

const WIDGETS_DIR = path.join(__dirname, '..', 'public', 'widgets');

const FILES_TO_MINIFY = [
  {
    input: 'theqah-widget.js',
    output: 'theqah-widget.min.js',
  },
  {
    input: 'theqah-stars.js',
    output: 'theqah-stars.min.js',
  },
];

const TERSER_OPTIONS = {
  compress: {
    drop_console: false, // Keep console for debugging
    drop_debugger: true,
    pure_funcs: ['console.debug'], // Remove debug logs only
    passes: 2,
  },
  mangle: {
    toplevel: false, // Don't mangle top-level names (for global API)
    reserved: ['TheQahWidget', 'TheQahStars', 'TheQahLoadingSkeleton', 'TheQahOffline'], // Preserve public APIs
  },
  format: {
    comments: /^!/, // Keep comments starting with !
    preamble: '/* TheQah Widget - https://theqah.com */',
  },
};

async function minifyFile(inputFile, outputFile) {
  const inputPath = path.join(WIDGETS_DIR, inputFile);
  const outputPath = path.join(WIDGETS_DIR, outputFile);

  console.log(`📦 Minifying ${inputFile}...`);

  try {
    // Read source file
    const code = fs.readFileSync(inputPath, 'utf8');
    const originalSize = Buffer.byteLength(code, 'utf8');

    // Minify
    const result = await minify(code, TERSER_OPTIONS);

    if (result.error) {
      throw result.error;
    }

    // Write minified file
    fs.writeFileSync(outputPath, result.code, 'utf8');
    const minifiedSize = Buffer.byteLength(result.code, 'utf8');

    // Calculate savings
    const savings = ((originalSize - minifiedSize) / originalSize * 100).toFixed(1);
    const originalKB = (originalSize / 1024).toFixed(2);
    const minifiedKB = (minifiedSize / 1024).toFixed(2);

    console.log(`✅ ${inputFile} → ${outputFile}`);
    console.log(`   Original:  ${originalKB} KB`);
    console.log(`   Minified:  ${minifiedKB} KB`);
    console.log(`   Savings:   ${savings}%`);
    console.log('');

    return {
      file: inputFile,
      originalSize,
      minifiedSize,
      savings: parseFloat(savings),
    };
  } catch (error) {
    console.error(`❌ Error minifying ${inputFile}:`, error.message);
    throw error;
  }
}

async function main() {
  console.log('🚀 Starting widget minification...\n');

  const results = [];

  for (const { input, output } of FILES_TO_MINIFY) {
    const result = await minifyFile(input, output);
    results.push(result);
  }

  // Summary
  console.log('📊 Summary:');
  console.log('─────────────────────────────────');

  const totalOriginal = results.reduce((sum, r) => sum + r.originalSize, 0);
  const totalMinified = results.reduce((sum, r) => sum + r.minifiedSize, 0);
  const totalSavings = ((totalOriginal - totalMinified) / totalOriginal * 100).toFixed(1);

  console.log(`Total Original:  ${(totalOriginal / 1024).toFixed(2)} KB`);
  console.log(`Total Minified:  ${(totalMinified / 1024).toFixed(2)} KB`);
  console.log(`Total Savings:   ${totalSavings}%`);

  // Check if we met the target
  const targetKB = 20;
  const actualKB = totalMinified / 1024;

  if (actualKB <= targetKB) {
    console.log(`\n✅ Target achieved! Minified size (${actualKB.toFixed(2)} KB) is under ${targetKB} KB`);
  } else {
    console.log(`\n⚠️  Target not met. Minified size (${actualKB.toFixed(2)} KB) exceeds ${targetKB} KB`);
    console.log('   Consider further optimization or code splitting.');
  }

  console.log('\n✨ Minification complete!');
}

// Run if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error('💥 Minification failed:', error);
    process.exit(1);
  });
}

module.exports = { minifyFile, TERSER_OPTIONS };
