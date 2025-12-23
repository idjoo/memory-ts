// ============================================================================
// EMBEDDING GENERATOR
// Converts text into semantic vectors for similarity matching and memory retrieval.
// Uses efficient, lightweight models optimized for real-time operation.
// ============================================================================

import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers'
import { logger } from '../utils/logger.ts'

/**
 * Embedding Generator Configuration
 */
export interface EmbeddingConfig {
  /**
   * Model to use for embeddings
   * Default: 'Xenova/all-MiniLM-L6-v2' (384 dimensions, ~80MB)
   */
  model?: string

  /**
   * Whether to log model loading progress
   * Default: true
   */
  verbose?: boolean
}

/**
 * Embedding Generator
 *
 * Generates semantic embeddings for text using SentenceTransformers via ONNX.
 * Loads the model once and keeps it in memory for fast inference.
 *
 * Model: all-MiniLM-L6-v2
 * - 384 dimensions (compact)
 * - 22.7M parameters (lightweight)
 * - ~80MB memory footprint
 * - ~5-15ms per embedding
 */
export class EmbeddingGenerator {
  private _model: FeatureExtractionPipeline | null = null
  private _modelName: string
  private _loading: Promise<void> | null = null
  private _dimension = 384

  constructor(config: EmbeddingConfig = {}) {
    this._modelName = config.model ?? 'Xenova/all-MiniLM-L6-v2'
  }

  /**
   * Initialize the embedding model
   * Call this during server startup to warm the model
   */
  async initialize(): Promise<void> {
    if (this._model) return
    if (this._loading) return this._loading

    this._loading = this._loadModel()
    await this._loading
  }

  private async _loadModel(): Promise<void> {
    try {
      logger.info(`Loading embedding model: ${this._modelName}`)

      // Create the feature extraction pipeline
      // Uses ONNX runtime for fast inference
      this._model = await pipeline('feature-extraction', this._modelName, {
        // Use fp32 for stability on all platforms
        dtype: 'fp32',
      })

      logger.info('Embedding model loaded successfully')
    } catch (error) {
      logger.error(`Failed to load embedding model: ${error}`)
      throw error
    }
  }

  /**
   * Generate embedding for a single text
   *
   * @param text - Input text to embed
   * @returns Float32Array of embedding values (384 dimensions)
   */
  async embed(text: string): Promise<Float32Array> {
    // Ensure model is loaded
    if (!this._model) {
      await this.initialize()
    }

    if (!text || !text.trim()) {
      return new Float32Array(this._dimension)
    }

    try {
      // Generate embedding
      const output = await this._model!(text.trim(), {
        pooling: 'mean',
        normalize: true,
      })

      // Extract the embedding data
      // The output shape is [1, sequence_length, hidden_size] -> need to get mean pooled result
      const data = output.data as Float32Array

      // Return as Float32Array (already the right type from transformers.js)
      return new Float32Array(data)
    } catch (error) {
      logger.error(`Failed to generate embedding: ${error}`)
      return new Float32Array(this._dimension)
    }
  }

  /**
   * Generate embeddings for multiple texts efficiently
   *
   * @param texts - List of texts to embed
   * @returns Array of Float32Array embeddings
   */
  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    if (!texts.length) return []

    // For now, process sequentially
    // (batch processing with transformers.js is more complex)
    const results: Float32Array[] = []
    for (const text of texts) {
      results.push(await this.embed(text))
    }
    return results
  }

  /**
   * Get the dimension of embeddings produced by this model
   */
  get dimension(): number {
    return this._dimension
  }

  /**
   * Check if the model is loaded and ready
   */
  get isReady(): boolean {
    return this._model !== null
  }

  /**
   * Create an embedder function for the engine config
   * This is the function signature expected by MemoryEngine
   */
  createEmbedder(): (text: string) => Promise<Float32Array> {
    return (text: string) => this.embed(text)
  }
}

/**
 * Create a new embedding generator
 */
export function createEmbeddings(config?: EmbeddingConfig): EmbeddingGenerator {
  return new EmbeddingGenerator(config)
}

/**
 * Singleton instance for the default embedder
 * Use this when you just need the default all-MiniLM-L6-v2 model
 */
let defaultInstance: EmbeddingGenerator | null = null

export function getDefaultEmbeddings(): EmbeddingGenerator {
  if (!defaultInstance) {
    defaultInstance = new EmbeddingGenerator()
  }
  return defaultInstance
}
