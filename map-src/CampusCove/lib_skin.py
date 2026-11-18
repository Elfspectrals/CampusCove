import heapq
from collections import Counter

import bmesh
import numpy as np

MAX_INFLUENCES = 4
WELD_STEP = 1e-5
WEIGHT_FLOOR = 0.02
HARD_SEAM_DIFFERENCE = 1.0
MAX_HARD_EDGES_PER_JOINT = 3
LIMB_SHARE = 0.5
BLEED_WEIGHT = 0.1
MAX_SIBLING_BLEED = 0.1
EDGE_LENGTH_PERCENTILE = 95
EDGES_PER_BLEND = 2
LONG_EDGE_FACTOR = 1.5
SPLIT_PASSES = 3


def capsule_distance(points, head, tail):
    axis = tail - head
    along = np.clip(((points - head) @ axis) / (axis @ axis), 0.0, 1.0)
    return np.linalg.norm(points - (head + along[:, None] * axis), axis=1)


def adjacency_lists(verts, edges):
    neighbours = [[] for _ in range(len(verts))]
    for a, b in edges:
        length = float(np.linalg.norm(verts[a] - verts[b]))
        neighbours[a].append((b, length))
        neighbours[b].append((a, length))
    return neighbours


def surface_distance(neighbours, sources, reachable):
    distance = np.full(len(neighbours), np.inf)
    queue = []
    for index in sources:
        distance[index] = 0.0
        queue.append((0.0, int(index)))
    heapq.heapify(queue)
    while queue:
        travelled, node = heapq.heappop(queue)
        if travelled > distance[node]:
            continue
        for other, length in neighbours[node]:
            candidate = travelled + length
            if reachable[other] and candidate < distance[other]:
                distance[other] = candidate
                heapq.heappush(queue, (candidate, other))
    return distance


def weld(verts, edges):
    keys = np.round(verts / WELD_STEP).astype(np.int64)
    _, first, inverse = np.unique(keys, axis=0, return_index=True, return_inverse=True)
    inverse = inverse.reshape(-1)
    joined = inverse[edges]
    return verts[first], joined[joined[:, 0] != joined[:, 1]], inverse


def ancestry(parents):
    chains = []
    for index in range(len(parents)):
        chain = [index]
        while parents[chain[-1]] >= 0:
            chain.append(parents[chain[-1]])
        chains.append(chain)
    return chains


def touching_pairs(nearest, edges):
    left, right = nearest[edges[:, 0]], nearest[edges[:, 1]]
    differ = left != right
    return {tuple(sorted(pair)) for pair in zip(left[differ].tolist(), right[differ].tolist())}


def same_branch(a, b, chains):
    return a in chains[b] or b in chains[a]


def neighbouring_bones(nearest, edges, parents, chains):
    related = [{index, parent} - {-1} for index, parent in enumerate(parents)]
    for index, parent in enumerate(parents):
        if parent >= 0:
            related[parent].add(index)
    for a, b in touching_pairs(nearest, edges):
        if same_branch(a, b, chains):
            related[a].add(b)
            related[b].add(a)
    return [sorted(others) for others in related]


def hand_contacts_to_common_bone(nearest, edges, neighbours, chains, blend):
    handed = nearest.copy()
    everywhere = np.ones(len(nearest), bool)
    for a, b in touching_pairs(nearest, edges):
        if same_branch(a, b, chains):
            continue
        common = next(bone for bone in chains[a] if bone in chains[b])
        left, right = nearest[edges[:, 0]], nearest[edges[:, 1]]
        between = ((left == a) & (right == b)) | ((left == b) & (right == a))
        near_contact = surface_distance(neighbours, np.unique(edges[between]), everywhere) < blend
        moved = near_contact & np.isin(nearest, [a, b])
        handed[moved] = common
    return handed


def proximity_weights(verts, edges, bones, blend):
    verts, edges, inverse = weld(verts, edges)
    names = list(bones)
    parents = np.array([names.index(parent) if parent is not None else -1 for _, _, parent in bones.values()])
    nearest = np.argmin(np.stack([capsule_distance(verts, head, tail) for head, tail, _ in bones.values()]), axis=0)
    neighbours = adjacency_lists(verts, edges)
    chains = ancestry(parents)
    nearest = hand_contacts_to_common_bone(nearest, edges, neighbours, chains, blend)
    related = neighbouring_bones(nearest, edges, parents, chains)
    raw = np.zeros((len(names), len(verts)))
    for index in range(len(names)):
        territory = np.nonzero(nearest == index)[0]
        if len(territory) == 0:
            continue
        reachable = np.isin(nearest, related[index])
        raw[index] = np.exp(-(surface_distance(neighbours, territory, reachable) / blend) ** 2)
    keep = np.argsort(raw, axis=0)[:-MAX_INFLUENCES]
    np.put_along_axis(raw, keep, 0.0, axis=0)
    raw[raw < WEIGHT_FLOOR] = 0.0
    raw /= raw.sum(axis=0)
    return {name: raw[index][inverse] for index, name in enumerate(names)}


def hard_edges_by_joint(weights, edges):
    names = list(weights)
    table = np.stack(list(weights.values()))
    difference = np.abs(table[:, edges[:, 0]] - table[:, edges[:, 1]]).sum(axis=0)
    dominant = table.argmax(axis=0)
    joints = Counter()
    for a, b in edges[difference > HARD_SEAM_DIFFERENCE]:
        joints[tuple(sorted((names[dominant[a]], names[dominant[b]])))] += 1
    return joints


def subtree_weights(weights, bones):
    children = {name: [] for name in bones}
    for name, (_, _, parent) in bones.items():
        if parent is not None:
            children[parent].append(name)

    def total(name):
        return weights[name] + sum((total(child) for child in children[name]), np.zeros_like(weights[name]))

    return {name: total(name) for name in bones}, children


def sibling_bleed(weights, bones):
    subtree, children = subtree_weights(weights, bones)
    worst = (0.0, None)
    for siblings in children.values():
        for mine in siblings:
            owned = subtree[mine] > LIMB_SHARE
            if not owned.any():
                continue
            for other in siblings:
                if other == mine:
                    continue
                share = float((subtree[other][owned] > BLEED_WEIGHT).mean())
                if share > worst[0]:
                    worst = (share, (mine, other))
    return worst


def skin_problems(weights, edges, bones):
    problems = []
    joint, count = max(hard_edges_by_joint(weights, edges).items(), key=lambda item: item[1], default=(None, 0))
    if count > MAX_HARD_EDGES_PER_JOINT:
        problems.append(f"{count} edges between {joint[0]} and {joint[1]} join vertices that follow different bones, the joint would tear")
    share, pair = sibling_bleed(weights, bones)
    if share > MAX_SIBLING_BLEED:
        problems.append(f"{share:.0%} of the {pair[0]} skin also follows {pair[1]}, the two would move as one")
    return problems


def read_mesh(obj, arm):
    verts = np.array([v.co[:] for v in obj.data.vertices])
    edges = np.array([e.vertices[:] for e in obj.data.edges])
    bones = {b.name: (np.array(b.head_local[:]), np.array(b.tail_local[:]), b.parent.name if b.parent else None) for b in arm.data.bones}
    return verts, edges, bones


def read_weights(obj, arm):
    weights = {b.name: np.zeros(len(obj.data.vertices)) for b in arm.data.bones}
    names = [group.name for group in obj.vertex_groups]
    for v in obj.data.vertices:
        for g in v.groups:
            if names[g.group] in weights:
                weights[names[g.group]][v.index] = g.weight
    return weights


def blend_width(verts, edges):
    lengths = np.linalg.norm(verts[edges[:, 0]] - verts[edges[:, 1]], axis=1)
    return EDGES_PER_BLEND * np.percentile(lengths, EDGE_LENGTH_PERCENTILE)


def split_long_edges(mesh):
    bm = bmesh.new()
    bm.from_mesh(mesh)
    limit = LONG_EDGE_FACTOR * float(np.percentile([e.calc_length() for e in bm.edges], EDGE_LENGTH_PERCENTILE))
    for _ in range(SPLIT_PASSES):
        long_edges = [e for e in bm.edges if e.calc_length() > limit]
        if not long_edges:
            break
        bmesh.ops.subdivide_edges(bm, edges=long_edges, cuts=1)
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.to_mesh(mesh)
    bm.free()


def skin_mesh(obj, arm):
    split_long_edges(obj.data)
    verts, edges, bones = read_mesh(obj, arm)
    weights = proximity_weights(verts, edges, bones, blend_width(verts, edges))
    problems = skin_problems(weights, edges, bones)
    if problems:
        raise RuntimeError(f"{obj.name}: " + "; ".join(problems))
    for name, w in weights.items():
        group = obj.vertex_groups.new(name=name)
        for i in np.nonzero(w > 0)[0]:
            group.add([int(i)], float(w[i]), "REPLACE")
    obj.parent = arm
    obj.modifiers.new("Armature", "ARMATURE").object = arm
    return weights, edges
