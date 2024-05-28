import * as THREE from "three";
import { blocks } from "./blocks";
import { Player } from "./player";
import { WorldChunk } from "./worldChunk";

const collisionMaterial = new THREE.MeshBasicMaterial({
    color: 0xff0000,
    transparent: true,
    opacity: 0.2,
});
const collisionGeometry = new THREE.BoxGeometry(1.001, 1.001, 1.001);

const contactMaterial = new THREE.MeshBasicMaterial({
    wireframe: true,
    color: 0x00ff00,
});
const contactGeometry = new THREE.SphereGeometry(0.05, 6, 6);

export class Physics {
    gravity = 32;

    // Physic simulation rate
    simulationRate = 250;
    stepSize = 1 / this.simulationRate;
    // Accumulator to keep track of leftover dt
    accumulator = 0;
    constructor(scene) {
        this.helpers = new THREE.Group();
        this.helpers.visible = false;
        scene.add(this.helpers);
    }

    /**
     *
     * @param {number} dt
     * @param {Player} player
     * @param {WorldChunk} world
     */
    update(dt, player, world) {
        this.accumulator += dt;
        // 只要 accumulator 中积累的时间大于或等于 stepSize，就进行一次物理模拟步骤。这可以处理帧率波动，确保物理计算的稳定性。
        // 防止帧率波动
        while (this.accumulator >= this.stepSize) {
            player.velocity.y -= this.gravity * this.stepSize;
            player.applyInputs(this.stepSize);
            this.detectCollisions(player, world);
            // 每次完成一个物理步骤后，减少 accumulator 中的时间，确保下一次物理步骤只在积累时间足够一个 stepSize 时才进行。
            this.accumulator -= this.stepSize;
        }

        player.updateBoundHelper();
    }

    /**
     *
     * @param {Player} player
     * @param {WorldChunk} world
     */
    detectCollisions(player, world) {
        player.onGround = false;
        this.helpers.clear();
        const candidates = this.broadPhase(player, world);
        const collisions = this.narrowPhase(candidates, player);

        if (collisions.length > 0) {
            this.resolveCollisions(collisions, player);
        }
    }

    //广义阶段 broadPhase：快速排除不可能发生碰撞的方块，只留下可能的候选方块。
    broadPhase(player, world) {
        const candidates = [];

        const extents = {
            x: {
                min: Math.floor(player.position.x - player.radius),
                max: Math.ceil(player.position.x + player.radius),
            },
            y: {
                min: Math.floor(player.position.y - player.height),
                max: Math.ceil(player.position.y),
            },
            z: {
                min: Math.floor(player.position.z - player.radius),
                max: Math.ceil(player.position.z + player.radius),
            },
        };

        for (let x = extents.x.min; x <= extents.x.max; x++) {
            for (let y = extents.y.min; y <= extents.y.max; y++) {
                for (let z = extents.z.min; z <= extents.z.max; z++) {
                    const block = world.getBlock(x, y, z)?.id;
                    if (block && block !== blocks.empty.id) {
                        const blockPos = { x, y, z };
                        candidates.push(blockPos);
                        this.addCollisionHelper(blockPos);
                    }
                }
            }
        }

        return candidates;
    }

    /**
     *
     * @param {{x:number, y:number, z:number}} candidates
     * @param {Player} player
     * @returns
     */
    // 精确阶段 narrowPhase：对候选方块进行精确的几何碰撞检测。
    narrowPhase(candidates, player) {
        const collisions = [];

        for (const block of candidates) {
            // Get the point on the block that is closest to the center of the player's bounding cylinder
            // 1.寻找最近的碰撞点
            const p = player.position;
            const closestPoint = {
                x: Math.max(block.x - 0.5, Math.min(p.x, block.x + 0.5)),
                y: Math.max(
                    block.y - 0.5,
                    Math.min(p.y - player.height / 2, block.y + 0.5)
                ),
                z: Math.max(block.z - 0.5, Math.min(p.z, block.z + 0.5)),
            };

            // Get distance along each axis between closest point and the center
            // of the player's bounding cylinder
            // 2.确定碰撞带你是否在圆柱体里面
            const dx = closestPoint.x - player.position.x;
            const dy = closestPoint.y - (player.position.y - player.height / 2);
            const dz = closestPoint.z - player.position.z;

            //如果在
            if (this.pointInPlayerBoundingCylinder(closestPoint, player)) {
                //计算碰撞点与玩家之间的重叠,沿y轴和xz平面的圆柱体
                const overlapY = player.height / 2 - Math.abs(dy);
                const overlapXZ = player.radius - Math.sqrt(dx * dx + dz * dz);

                //计算碰撞的法线（指向远离接触点的方向）
                //以及点和玩家的边界圆柱体之间的重叠
                let normal, overlap;
                if (overlapY < overlapXZ) {
                    normal = new THREE.Vector3(0, -Math.sign(dy), 0);
                    overlap = overlapY;
                    player.onGround = true;
                } else {
                    normal = new THREE.Vector3(-dx, 0, -dz).normalize();
                    overlap = overlapXZ;
                }

                //记录碰撞
                collisions.push({
                    overlap,
                    normal,
                    block,
                    contactPoint: closestPoint,
                });

                this.addContactPointerHelper(closestPoint);
            }
        }

        // console.log(`Collisions: ${collisions.length}`);
        return collisions;
    }

    resolveCollisions(collisions, player) {
        collisions.sort((a, b) => {
            return b.overlap > a.overlap;
        });
        for (const collision of collisions) {
            // We need to re-check if the contact point is inside the player bounding
            // cylinder for each collision since the player position is updated after
            // each collision is resolved
            if (
                !this.pointInPlayerBoundingCylinder(
                    collision.contactPoint,
                    player
                )
            )
                continue;
            //1.调整player不在与圆柱体有重叠
            let deltaPosition = collision.normal.clone();
            deltaPosition.multiplyScalar(collision.overlap);
            player.position.add(deltaPosition);

            // Get the magnitude of the player's velocity along the collision normal
            let magnitude = player.worldVelocity.dot(collision.normal);
            // Remove that part of the velocity from the player's velocity
            let velocityAdjustment = collision.normal
                .clone()
                .multiplyScalar(magnitude);

            // Apply the velocity to the player
            player.applyWorldDeltaVelocity(velocityAdjustment.negate());
        }
    }

    /**
     * Returns true if the point 'p' is inside the player's bounding cylinder
     * @param {{ x: number, y: number, z: number }} p
     * @param {Player} player
     * @returns {boolean}
     */
    pointInPlayerBoundingCylinder(p, player) {
        const dx = p.x - player.position.x;
        const dy = p.y - (player.position.y - player.height / 2);
        const dz = p.z - player.position.z;
        const r_sq = dx * dx + dz * dz;

        // Check if contact point is inside the player's bounding cylinder
        return (
            Math.abs(dy) < player.height / 2 &&
            r_sq < player.radius * player.radius
        );
    }

    /**
     * Visualizes the block the player is colliding with
     * @param {THREE.Object3D} block
     */
    addCollisionHelper(block) {
        const blockMesh = new THREE.Mesh(collisionGeometry, collisionMaterial);
        blockMesh.position.copy(block);
        this.helpers.add(blockMesh);
    }

    /**
     * Visualizes the contact at the point 'p'
     * @param {{ x, y, z }} p
     */
    addContactPointerHelper(p) {
        const contactMesh = new THREE.Mesh(contactGeometry, contactMaterial);
        contactMesh.position.copy(p);
        this.helpers.add(contactMesh);
    }
}
