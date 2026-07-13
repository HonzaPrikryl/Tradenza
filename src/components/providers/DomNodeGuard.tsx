'use client'

/**
 * DomNodeGuard
 *
 * Makes React's DOM reconciler resilient to third-party DOM mutation
 * (most commonly Google Translate / translation extensions, which wrap text
 * nodes in <font> elements and move them around). When React later tries to
 * remove or reorder a node whose parent no longer matches, the browser throws:
 *
 *   NotFoundError: Failed to execute 'removeChild' on 'Node':
 *   The node to be removed is not a child of this node.
 *
 * We patch removeChild/insertBefore to no-op when the node isn't actually a
 * child of the expected parent, instead of throwing. This keeps browser
 * translation working while preventing the crash. Standard, well-established
 * workaround for the React + browser-extension reconciliation race.
 *
 * Patched at module-eval time (client only) so it applies before hydration.
 */
if (typeof window !== 'undefined' && typeof Node === 'function' && Node.prototype) {
  const originalRemoveChild = Node.prototype.removeChild
  Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.warn('DomNodeGuard: skipped removeChild for node not owned by this parent', child, this)
      }
      return child
    }
    return originalRemoveChild.call(this, child) as T
  }

  const originalInsertBefore = Node.prototype.insertBefore
  Node.prototype.insertBefore = function <T extends Node>(this: Node, newNode: T, referenceNode: Node | null): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.warn(
          'DomNodeGuard: fell back to appendChild; reference node not owned by this parent',
          referenceNode,
          this,
        )
      }
      return this.appendChild(newNode) as T
    }
    return originalInsertBefore.call(this, newNode, referenceNode) as T
  }
}

export default function DomNodeGuard() {
  return null
}
