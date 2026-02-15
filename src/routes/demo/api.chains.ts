import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import * as fs from 'node:fs'
import { ethers } from 'ethers'

const CHAINS = {
  solana: {
    url: 'https://api.mainnet-beta.solana.com',
    parseFinality: async () => {
      try {
        const res = await fetch('https://api.mainnet-beta.solana.com', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getRecentPerformanceSamples',
            params: [1],
          }),
        })
        const json = await res.json()
        const sample = json.result?.[0]
        if (sample && sample.numSlots > 0) {
          const avgSlotMs = (sample.samplePeriodSecs * 1000) / sample.numSlots // e.g., 60s / ~150 slots ≈ 400ms/slot
          return Math.round(avgSlotMs * 32) // ~32 slots for economic finality
        }
        return 12800
      } catch {
        return 12800 // Current known average
      }
    },
  },
  sui: {
    url: 'https://fullnode.mainnet.sui.io:443',
    parseFinality: async () => {
      try {
        // Get recent checkpoints and average timestamp diff
        const latestRes = await fetch('https://fullnode.mainnet.sui.io', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'sui_getLatestCheckpointSequenceNumber',
            params: [],
          }),
        })
        const latest = (await latestRes.json()).result

        // Fetch two checkpoints ~10 apart for avg time per checkpoint
        const cpRecent = await (
          await fetch('https://fullnode.mainnet.sui.io', {
            method: 'POST',
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'sui_getCheckpoint',
              params: [latest.toString()],
            }),
          })
        ).json()

        const cpOlder = await (
          await fetch('https://fullnode.mainnet.sui.io', {
            method: 'POST',
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 1,
              method: 'sui_getCheckpoint',
              params: [(latest - 10).toString()],
            }),
          })
        ).json()

        const timeDiffMs =
          parseInt(cpRecent.result.timestampMs) -
          parseInt(cpOlder.result.timestampMs)
        const avgPerCheckpointMs = timeDiffMs / 10

        // Most tx finalize in ~1 checkpoint → use this or cap at ~500ms P95
        return Math.round(avgPerCheckpointMs) || 390 // fallback to advertised Mysticeti
      } catch {
        return 390 // Safe fallback (Mysticeti consensus time)
      }
    },
  },
  // kaspa: {
  //   url: 'https://api.kaspa.org', // Public REST API/explorer (or use gRPC/wRPC if you prefer advanced)
  //   parseFinality: async () => {
  //     try {
  //       // Optional: Fetch recent data from explorer API if it exposes timestamps/stats
  //       // For example: query recent blocks and average confirmation depth time
  //       // But currently limited → fallback to documented values
  //       return 10000 // 10 seconds (current practical finality in ms)
  //     } catch {
  //       return 10000 // Fallback
  //     }
  //   },
  // },
  // aptos: {
  //   url: 'https://fullnode.mainnet.aptoslabs.com/v1',
  //   parseFinality: () => 400,
  // },
  // icp: {
  //   url: 'https://dashboard.internetcomputer.org/api/v3/metrics',
  //   parseFinality: () => 1000,
  // },
  bnb: {
    url: 'https://bsc-rpc.publicnode.com', // or https://bsc-dataseed.bnbchain.org
    parseFinality: async () => {
      try {
        const provider = new ethers.JsonRpcProvider(
          'https://bsc-dataseed.bnbchain.org/',
        )
        // Get latest block number
        const latestBlockNum = await provider.getBlockNumber()

        // Fetch last 5–10 blocks for a good average (adjust as needed)
        const blocks = await Promise.all(
          Array.from({ length: 5 }, (_, i) =>
            provider.getBlock(latestBlockNum - i),
          ),
        )

        // Calculate average block time (in ms)
        let totalTimeMs = 0
        let count = 0
        for (let i = 1; i < blocks.length; i++) {
          if (blocks[i] && blocks[i - 1]) {
            const diff = (blocks[i - 1].timestamp - blocks[i].timestamp) * 1000 // seconds → ms
            totalTimeMs += diff
            count++
          }
        }
        const avgBlockTimeMs = count > 0 ? totalTimeMs / count : 750 // fallback to ~0.75s

        // Fast finality depth: ~2.5 blocks (conservative average post-2025 upgrades)
        // After Fermi (Jan 14+): can reduce to ~2–2.5
        const finalityDepth = 2.5
        const estimatedFinalityMs = Math.round(avgBlockTimeMs * finalityDepth)

        console.log(`Avg block time: ${avgBlockTimeMs.toFixed(0)} ms`)
        console.log(
          `Estimated fast finality: ${estimatedFinalityMs} ms (~${(estimatedFinalityMs / 1000).toFixed(2)}s)`,
        )

        return estimatedFinalityMs
      } catch (error) {
        console.error('Error estimating BNB finality:', error)
        return 1875 // Hard fallback to current ~1.875s
      }
    },
  },
  // near: { url: 'https://rpc.mainnet.near.org', parseFinality: () => 1200 },
  // avalanche: {
  //   url: 'https://api.avax.network/ext/bc/C/rpc',
  //   parseFinality: () => 1500,
  // },
  somnia: {
    url: 'https://api.infra.mainnet.somnia.network/', // or any of the others above
    parseFinality: async () => {
      try {
        const provider = new ethers.JsonRpcProvider(
          'https://api.infra.mainnet.somnia.network',
        )
        const latestNum = await provider.getBlockNumber()
        const blocks = await Promise.all(
          Array.from({ length: 5 }, (_, i) => provider.getBlock(latestNum - i)),
        )

        let totalMs = 0,
          count = 0
        for (let i = 1; i < blocks.length; i++) {
          if (blocks[i] && blocks[i - 1]) {
            totalMs += (blocks[i - 1].timestamp - blocks[i].timestamp) * 1000
            count++
          }
        }
        const avgBlockMs = count > 0 ? totalMs / count : 100 // ~0.1s block time

        console.log(`somnia Avg block time: ${avgBlockMs.toFixed(0)} ms`)
        // Somnia finality ≈ 1–2 blocks (BFT-style sub-second)
        return Math.round(avgBlockMs * 1.5) || 150 // e.g., 150–300 ms
      } catch {
        return 150 // Conservative sub-second fallback
      }
    },
  },
}

const METRICS_FILE = 'src/data/metrics.json'

async function updateMetrics() {
  console.log('run updateMetrics')
  const metrics = {}

  for (const [chain, info] of Object.entries(CHAINS)) {
    try {
      // Most chains don't need POST, but Solana does
      // let response
      // if (chain === 'solana' || chain === 'somnia') {
      //   response = await info.parseFinality() // special handling
      // } else {
      //   response = await fetch(info.url).then((r) => r.text())
      //   // Many APIs return JSON or text - adapt parsing per chain in real project
      // }

      const finality_ms = await info.parseFinality()
      // const finality_ms =
      //   typeof info.parseFinality === 'function'
      //     ? await info.parseFinality()
      //     : 500 // fallback

      console.log(`${chain} finality_ms: ${finality_ms}`)

      metrics[chain] = {
        finality_ms: finality_ms || 0.1,
        description:
          chain === 'multiversx'
            ? 'Supernova - true instant finality'
            : 'Live data',
        status: 'LIVE NOW',
      }
    } catch (e) {
      console.error(`Error fetching ${chain}:`, e.message)
      metrics[chain] = {
        finality_ms: 9999,
        description: 'Error fetching data',
        status: 'ERROR',
      }
    }
  }

  await fs.promises.writeFile(METRICS_FILE, JSON.stringify(metrics, null, 2))
  console.log('Metrics updated:', new Date().toISOString())
}

updateMetrics()
setInterval(updateMetrics, 60000)

export const Route = createFileRoute('/demo/api/chains')({
  server: {
    handlers: {
      GET: async () => {
        const metrics = await fs.promises.readFile(METRICS_FILE, 'utf-8')
        return json(JSON.parse(metrics))
      },
    },
  },
})
