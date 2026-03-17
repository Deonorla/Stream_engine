import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'

export function latLonToVec3(lat, lon, radius = 1) {
  const phi   = (90 - lat)  * (Math.PI / 180)
  const theta = (lon + 180) * (Math.PI / 180)
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
     radius * Math.cos(phi),
     radius * Math.sin(phi) * Math.sin(theta)
  )
}

function buildArc(from, to, segments = 30, lift = 0.35) {
  const start = latLonToVec3(from[0], from[1])
  const end   = latLonToVec3(to[0],   to[1])
  const mid   = start.clone().add(end).multiplyScalar(0.5).normalize().multiplyScalar(1 + lift)
  return new THREE.QuadraticBezierCurve3(start, mid, end).getPoints(segments)
}

const STREAMS = [
  { from: [6.5,3.4],    to: [51.5,-0.1],   color: '#3b82f6', speed: 0.5  },
  { from: [40.7,-74],   to: [35.7,139.7],  color: '#3b82f6', speed: 0.45 },
  { from: [51.5,-0.1],  to: [1.3,103.8],   color: '#3b82f6', speed: 0.55 },
  { from: [48.9,2.3],   to: [40.7,-74],    color: '#3b82f6', speed: 0.4  },
  { from: [-33.9,18.4], to: [48.9,2.3],    color: '#3b82f6', speed: 0.5  },
  { from: [43.7,-79.4], to: [37.4,-122],   color: '#3b82f6', speed: 0.48 },
  { from: [19.4,-99.1], to: [40.7,-74],    color: '#3b82f6', speed: 0.42 },
  { from: [40.7,-74],   to: [-23.5,-46.6], color: '#3b82f6', speed: 0.38 },
  { from: [51.5,-0.1],  to: [-33.9,18.4],  color: '#3b82f6', speed: 0.44 },
  { from: [43.7,-79.4], to: [19.4,-99.1],  color: '#3b82f6', speed: 0.5  },
  { from: [37.4,-122],  to: [-33.9,151.2], color: '#3b82f6', speed: 0.36 },
  { from: [6.5,3.4],    to: [40.7,-74],    color: '#3b82f6', speed: 0.46 },
  { from: [37.4,-122],  to: [51.5,-0.1],   color: '#a855f7', speed: 0.7  },
  { from: [35.7,139.7], to: [37.4,-122],   color: '#a855f7', speed: 0.65 },
  { from: [28.6,77.2],  to: [37.4,-122],   color: '#a855f7', speed: 0.6  },
  { from: [55.7,37.6],  to: [51.5,-0.1],   color: '#a855f7', speed: 0.5  },
  { from: [35.7,139.7], to: [28.6,77.2],   color: '#a855f7', speed: 0.58 },
  { from: [55.7,37.6],  to: [28.6,77.2],   color: '#a855f7', speed: 0.52 },
  { from: [31.2,121.5], to: [37.4,-122],   color: '#a855f7', speed: 0.62 },
  { from: [48.9,2.3],   to: [55.7,37.6],   color: '#a855f7', speed: 0.45 },
  { from: [25.2,55.3],  to: [40.7,-74],    color: '#10b981', speed: 0.25 },
  { from: [-23.5,-46.6],to: [51.5,-0.1],   color: '#10b981', speed: 0.22 },
  { from: [1.3,103.8],  to: [25.2,55.3],   color: '#10b981', speed: 0.28 },
  { from: [-33.9,151.2],to: [1.3,103.8],   color: '#10b981', speed: 0.3  },
  { from: [28.6,77.2],  to: [25.2,55.3],   color: '#10b981', speed: 0.32 },
  { from: [31.2,121.5], to: [35.7,139.7],  color: '#10b981', speed: 0.35 },
  { from: [-33.9,151.2],to: [25.2,55.3],   color: '#10b981', speed: 0.27 },
  { from: [6.5,3.4],    to: [25.2,55.3],   color: '#10b981', speed: 0.3  },
  { from: [-23.5,-46.6],to: [6.5,3.4],     color: '#10b981', speed: 0.24 },
  { from: [1.3,103.8],  to: [31.2,121.5],  color: '#10b981', speed: 0.33 },
  { from: [25.2,55.3],  to: [51.5,-0.1],   color: '#10b981', speed: 0.26 },
  { from: [-33.9,18.4], to: [1.3,103.8],   color: '#10b981', speed: 0.29 },
]

export const CITIES = [
  { lat: 6.5,   lon: 3.4,    color: '#3b82f6', label: 'Lagos',        detail: '0.000001 USDC/sec',  type: 'STREAM'    },
  { lat: 51.5,  lon: -0.1,   color: '#3b82f6', label: 'London',       detail: '0.0003 USDC ✓ 12ms', type: 'PAID'      },
  { lat: 40.7,  lon: -74,    color: '#3b82f6', label: 'New York',      detail: '$240 USDC',         type: 'FLASH ADV' },
  { lat: 35.7,  lon: 139.7,  color: '#a855f7', label: 'Tokyo',         detail: 'AI call ✓ 8ms',     type: 'AI CALL'   },
  { lat: 48.9,  lon: 2.3,    color: '#3b82f6', label: 'Paris',         detail: '0.001 USDC ✓ 8ms',   type: 'PAID'      },
  { lat: 37.4,  lon: -122,   color: '#a855f7', label: 'San Francisco', detail: 'Gemini AI active',   type: 'AI CALL'   },
  { lat: 1.3,   lon: 103.8,  color: '#10b981', label: 'Singapore',     detail: '0.00005 USDC/sec',    type: 'STREAM'    },
  { lat: 25.2,  lon: 55.3,   color: '#10b981', label: 'Dubai',         detail: '+$0.0071/sec',       type: 'RWA YIELD' },
  { lat: -33.9, lon: 18.4,   color: '#3b82f6', label: 'Cape Town',     detail: 'KYC Verified',       type: 'KYC ✓'    },
  { lat: -23.5, lon: -46.6,  color: '#10b981', label: 'São Paulo',     detail: 'NFT #9034 minted',   type: 'MINT NFT'  },
  { lat: 43.7,  lon: -79.4,  color: '#3b82f6', label: 'Toronto',       detail: '0.00002 USDC/sec',    type: 'STREAM'    },
  { lat: 28.6,  lon: 77.2,   color: '#a855f7', label: 'Delhi',         detail: 'AI inference ✓',     type: 'AI CALL'   },
  { lat: 55.7,  lon: 37.6,   color: '#a855f7', label: 'Moscow',        detail: 'AI call ✓ 11ms',     type: 'AI CALL'   },
  { lat: -33.9, lon: 151.2,  color: '#10b981', label: 'Sydney',        detail: '+$0.003/sec',        type: 'RWA YIELD' },
  { lat: 31.2,  lon: 121.5,  color: '#10b981', label: 'Shanghai',      detail: 'RWA yield active',   type: 'RWA YIELD' },
]

const CITY_LIGHTS = [
  [53.3,-6.3],[52.5,13.4],[41.9,12.5],[40.4,-3.7],[38.7,-9.1],[59.9,10.7],[59.3,18.1],[50.1,14.4],[47.5,19.0],[44.8,20.5],
  [34.0,-118.2],[41.8,-87.6],[29.7,-95.4],[33.4,-112.1],[47.6,-122.3],[45.5,-73.6],[25.8,-80.2],[39.9,-75.2],[36.2,-86.8],[32.8,-96.8],
  [-12.0,-77.0],[-34.6,-58.4],[-15.8,-47.9],[-33.4,-70.6],[4.7,-74.1],[10.5,-66.9],[-0.2,-78.5],[-16.5,-68.1],
  [30.0,31.2],[33.9,-6.8],[36.8,10.2],[-1.3,36.8],[9.0,38.7],[14.7,-17.4],[12.4,-1.5],[5.6,-0.2],[6.4,3.4],[15.6,32.5],
  [39.9,116.4],[28.6,77.2],[19.1,72.9],[13.1,80.3],[23.1,113.3],[22.3,114.2],[37.6,127.0],[14.1,100.5],[21.0,105.8],[3.1,101.7],
  [41.0,28.9],[24.9,67.0],[33.3,44.4],[35.7,51.4],[43.2,76.9],[55.0,82.9],[56.8,60.6],[53.9,27.6],
  [-37.8,145.0],[-27.5,153.0],[-31.9,115.9],[-36.9,174.8],
  [24.7,46.7],[29.4,47.9],[33.5,36.3],[31.8,35.2],[25.1,55.2],
]

// Merged arc lines — 3 draw calls total (one per color)
function ArcLines({ arcData }) {
  const geos = useMemo(() => {
    const groups = { '#3b82f6': [], '#a855f7': [], '#10b981': [] }
    arcData.forEach(({ points, color }) => groups[color].push(...points))
    return Object.entries(groups).map(([color, pts]) => ({
      color,
      geo: new THREE.BufferGeometry().setFromPoints(pts),
    }))
  }, [arcData])

  return (
    <>
      {geos.map(({ color, geo }) => (
        <lineSegments key={color} geometry={geo}>
          <lineBasicMaterial color={color} transparent opacity={0.65} depthWrite={false} />
        </lineSegments>
      ))}
    </>
  )
}

// Travelling dots — one per stream
function TravelDots({ arcData }) {
  const dotRefs = useRef(arcData.map(() => ({ mesh: null, t: Math.random() })))

  useFrame((_, delta) => {
    dotRefs.current.forEach((item, i) => {
      if (!item.mesh) return
      item.t = (item.t + delta * arcData[i].speed) % 1
      const pts = arcData[i].points
      const pt  = pts[Math.floor(item.t * (pts.length - 1))]
      if (pt) item.mesh.position.set(pt.x, pt.y, pt.z)
    })
  })

  return (
    <>
      {arcData.map((s, i) => (
        <mesh key={i} ref={el => { dotRefs.current[i].mesh = el }}>
          <sphereGeometry args={[0.022, 5, 5]} />
          <meshBasicMaterial color={s.color} />
        </mesh>
      ))}
    </>
  )
}

// All city lights as a single Points object — 1 draw call
function CityLights() {
  const geo = useMemo(() => {
    const all = [
      ...CITY_LIGHTS.map(([lat, lon]) => latLonToVec3(lat, lon, 1.012)),
      ...CITIES.map(c => latLonToVec3(c.lat, c.lon, 1.012)),
    ]
    return new THREE.BufferGeometry().setFromPoints(all)
  }, [])

  return (
    <points geometry={geo}>
      <pointsMaterial color="#fbbf24" size={0.018} sizeAttenuation transparent opacity={0.9} />
    </points>
  )
}

export function GlobeScene() {
  const groupRef = useRef()
  const landMask = useTexture('/earth-topology.png')

  const arcData = useMemo(() => STREAMS.map(s => ({ ...s, points: buildArc(s.from, s.to) })), [])

  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.04
  })

  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[4, 3, 4]} intensity={1.2} color="#4a90d9" />
      <pointLight position={[-3, -2, -3]} intensity={0.3} color="#7c3aed" />

      <group ref={groupRef} rotation={[0, Math.PI, 0]}>
        {/* Globe */}
        <mesh>
          <sphereGeometry args={[1, 32, 32]} />
          <meshPhongMaterial
            color={new THREE.Color('#0d1f3c')}
            emissive={new THREE.Color('#1a4a8a')}
            emissiveMap={landMask}
            emissiveIntensity={0.6}
            specular={new THREE.Color('#1a3a6a')}
            shininess={10}
          />
        </mesh>
        <mesh>
          <sphereGeometry args={[1.001, 32, 32]} />
          <meshBasicMaterial color="#1e3a5f" wireframe transparent opacity={0.07} />
        </mesh>
        <mesh>
          <sphereGeometry args={[1.06, 16, 16]} />
          <meshBasicMaterial color="#1a4a8a" transparent opacity={0.08} side={THREE.BackSide} />
        </mesh>

        <CityLights />
        <ArcLines arcData={arcData} />
        <TravelDots arcData={arcData} />
      </group>
    </>
  )
}
