#!/usr/bin/env node
/**
 * Hook Order Checker — catches useState-after-useMemo TDZ bugs
 *
 * Scans .jsx/.js files for cases where useMemo/useCallback dependency arrays
 * reference a useState variable declared LATER in the SAME component.
 * This works in dev but crashes in production minified builds.
 *
 * Run: node scripts/check-hook-order.cjs
 * Exit code 0 = clean, 1 = violations found
 */

const fs = require('fs')
const path = require('path')

function findFiles(dir) {
  const results = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory() && !['node_modules', 'dist', '.git'].includes(entry.name)) {
      results.push(...findFiles(full))
    } else if (entry.isFile() && /\.(jsx|js)$/.test(entry.name) && !entry.name.endsWith('.test.js') && !entry.name.endsWith('.cjs')) {
      results.push(full)
    }
  }
  return results
}

// Find component function boundaries by tracking brace depth
function findComponents(lines) {
  const components = []
  // Match: export function Foo(  |  function Foo(  |  const Foo = (  |  const Foo = function(
  const funcPattern = /^[\s]*(?:export\s+)?(?:function\s+([A-Z]\w*)\s*\(|const\s+([A-Z]\w*)\s*=\s*(?:\([^)]*\)\s*=>|\(\s*\)\s*=>|function\s*\())/

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(funcPattern)
    if (!match) continue

    const name = match[1] || match[2]
    let braceDepth = 0
    let started = false

    for (let j = i; j < lines.length; j++) {
      for (const ch of lines[j]) {
        if (ch === '{') { braceDepth++; started = true }
        if (ch === '}') braceDepth--
      }
      if (started && braceDepth <= 0) {
        components.push({ name, start: i, end: j })
        break
      }
    }
  }
  return components
}

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8')
  const lines = content.split('\n')
  const violations = []
  const components = findComponents(lines)

  for (const comp of components) {
    const stateDecls = [] // { name, line }
    const memoHooks = [] // { deps[], bodyVars[], line, hookType }

    for (let i = comp.start; i <= comp.end; i++) {
      const line = lines[i]

      // Match useState
      const stateMatch = line.match(/const\s+\[(\w+),\s*set\w+\]\s*=\s*useState/)
      if (stateMatch) {
        stateDecls.push({ name: stateMatch[1], line: i + 1 })
      }

      // Match useMemo/useCallback
      const memoMatch = line.match(/(useMemo|useCallback)\s*\(/)
      if (memoMatch) {
        const hookType = memoMatch[1]

        // Gather full hook text to find deps and body vars
        let fullText = ''
        for (let j = i; j <= Math.min(i + 100, comp.end); j++) {
          fullText += lines[j] + '\n'
          // Stop when we find the closing of the hook: }, [deps])
          if (/\]\s*\)\s*$/.test(lines[j].trim())) break
        }

        // Extract dependency array
        const deps = []
        const depsMatch = fullText.match(/,\s*\[([^\]]*)\]\s*\)/)
        if (depsMatch) {
          depsMatch[1].split(',').map(d => d.trim()).filter(Boolean).forEach(d => deps.push(d))
        }

        // Extract body variable references
        const bodyVars = []
        const bodyMatch = fullText.match(/(?:useMemo|useCallback)\s*\(\s*(?:\([^)]*\)|)\s*=>\s*\{?([\s\S]*?)(?:\}\s*,\s*\[|,\s*\[)/)
        if (bodyMatch) {
          const ids = bodyMatch[1].match(/\b[a-zA-Z_]\w*\b/g) || []
          new Set(ids).forEach(id => bodyVars.push(id))
        }

        memoHooks.push({ deps, bodyVars, line: i + 1, hookType })
      }
    }

    // Check within this component only
    for (const memo of memoHooks) {
      for (const sv of stateDecls) {
        if (sv.line > memo.line) {
          const inDeps = memo.deps.includes(sv.name)
          const inBody = memo.bodyVars.includes(sv.name)
          if (inDeps || inBody) {
            violations.push({
              file: filePath,
              component: comp.name,
              stateVar: sv.name,
              stateLine: sv.line,
              memoLine: memo.line,
              hookType: memo.hookType,
              where: inDeps ? 'dependency array' : 'body',
            })
          }
        }
      }
    }
  }

  return violations
}

// Main
const srcDir = path.join(__dirname, '..', 'src')
const files = findFiles(srcDir)
let allViolations = []

for (const file of files) {
  try {
    allViolations.push(...checkFile(file))
  } catch (e) {
    // Skip unparseable files
  }
}

if (allViolations.length > 0) {
  console.error(`\n  ❌ ${allViolations.length} hook ordering violation(s) found:\n`)
  for (const v of allViolations) {
    const rel = path.relative(path.join(__dirname, '..'), v.file)
    console.error(`     ${rel}:${v.memoLine} — ${v.hookType} uses "${v.stateVar}" (in ${v.where}) but useState is at line ${v.stateLine}`)
    console.error(`       → In ${v.component}: move "const [${v.stateVar}, set...] = useState(...)" ABOVE line ${v.memoLine}`)
  }
  console.error('')
  process.exit(1)
} else {
  process.exit(0)
}
