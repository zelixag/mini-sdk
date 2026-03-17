<template>
  <canvas ref="canvasRef" class="webgl-canvas" :width="width" :height="height" :style="canvasTransformStyle"></canvas>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, reactive, computed } from 'vue' // Add reactive and computed
import XmovAvatar from 'youling-lite';
const { GLDevice } = XmovAvatar;

const props = defineProps({
  width: { type: Number, required: true },
  height: { type: Number, required: true }
})

const canvasRef = ref(null)
let device = null

// Zoom and drag state
const zoomState = reactive({
  isZoomed: false,
  scale: 1,
  translateX: 0,
  translateY: 0,
});

const dragState = reactive({
  isDragging: false,
  startX: 0,
  startY: 0,
  initialTranslateX: 0, // Store initial translate for dragging
  initialTranslateY: 0, // Store initial translate for dragging
});

// Computed style for canvas transform
const canvasTransformStyle = computed(() => {
  return {
    transformOrigin: '0 0', // Set transform origin to top-left
    transform: `translate(${zoomState.translateX}px, ${zoomState.translateY}px) scale(${zoomState.scale})`,
    cursor: zoomState.isZoomed ? (dragState.isDragging ? 'grabbing' : 'grab') : 'zoom-in',
  };
});

// Event handlers
let isClick = true; // Flag to distinguish click from drag

const handleClick = (event) => {
  if (!isClick) {
    isClick = true; // Reset for next click
    return;
  }

  if (zoomState.isZoomed) {
    // Reset to original size
    zoomState.isZoomed = false;
    zoomState.scale = 1;
    zoomState.translateX = 0;
    zoomState.translateY = 0;
  } else {
    // Zoom in
    zoomState.isZoomed = true;
    zoomState.scale = 8; // Example: zoom 8x

    const canvas = canvasRef.value;
    const rect = canvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left; // Click X relative to canvas
    const clickY = event.clientY - rect.top; // Click Y relative to canvas
    zoomState.translateX = -clickX * (zoomState.scale - 1);
    zoomState.translateY = -clickY * (zoomState.scale - 1);
  }
};

const handleMouseDown = (event) => {
  if (zoomState.isZoomed && event.button === 0) { // Only left click for dragging
    dragState.isDragging = true;
    dragState.startX = event.clientX;
    dragState.startY = event.clientY;
    dragState.initialTranslateX = zoomState.translateX;
    dragState.initialTranslateY = zoomState.translateY;
    canvasRef.value.style.cursor = 'grabbing';
    isClick = true; // Assume it's a click until mouse moves significantly
  }
};

const handleMouseMove = (event) => {
  if (dragState.isDragging) {
    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;

    // If mouse moves more than a few pixels, it's a drag, not a click
    if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
      isClick = false;
    }

    let newTranslateX = dragState.initialTranslateX + deltaX;
    let newTranslateY = dragState.initialTranslateY + deltaY;

    // Clamp translation to prevent showing empty space
    const canvas = canvasRef.value;
    const maxTranslateX = 0;
    const minTranslateX = -(canvas.width * zoomState.scale - canvas.width);
    const maxTranslateY = 0;
    const minTranslateY = -(canvas.height * zoomState.scale - canvas.height);

    zoomState.translateX = Math.max(Math.min(maxTranslateX, newTranslateX), minTranslateX);
    zoomState.translateY = Math.max(Math.min(maxTranslateY, newTranslateY), minTranslateY);
  }
};

const handleMouseUp = () => {
  if (dragState.isDragging) {
    dragState.isDragging = false;
    canvasRef.value.style.cursor = 'grab';
  }
};

// Expose for use by parent component
defineExpose({
  getDevice: () => device
})

onMounted(() => {
  device = new GLDevice(canvasRef.value);

  // Add event listeners
  const canvas = canvasRef.value;
  canvas.addEventListener('click', handleClick);
  canvas.addEventListener('mousedown', handleMouseDown);
  canvas.addEventListener('mousemove', handleMouseMove);
  canvas.addEventListener('mouseup', handleMouseUp);
  canvas.addEventListener('mouseleave', handleMouseUp); // Stop dragging if mouse leaves canvas
})

onBeforeUnmount(() => {
  device.stop();
  // Remove event listeners
  const canvas = canvasRef.value;
  if (canvas) {
    canvas.removeEventListener('click', handleClick);
    canvas.removeEventListener('mousedown', handleMouseDown);
    canvas.removeEventListener('mousemove', handleMouseMove);
    canvas.removeEventListener('mouseup', handleMouseUp);
    canvas.removeEventListener('mouseleave', handleMouseUp);
  }
})
</script>

<style scoped>
.webgl-canvas {
  max-width: 100%;
  max-height: 100%;
  /* Add transition for smoother zoom */
  transition: transform 0.2s ease-out;
}
</style>