const canvas = document.querySelector('canvas')
if (!canvas) throw new Error('No canvas: open /game and wait for the town to load first')
Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => canvas })
document.dispatchEvent(new Event('pointerlockchange'))
'pointer lock faked'
