// ============================================================================
// EMBEDDING GENERATOR
// Converts text into semantic vectors for similarity matching and memory retrieval.
// Supports local models (HuggingFace) and cloud providers (Google Vertex AI).
// ============================================================================

import { logger } from '../utils/logger.ts'

/**
 * Embedding provider type
 * - 'local': Use local HuggingFace transformers model (default)
 * - 'google-vertex': Use Google Vertex AI embeddings via @google/genai
 */
export type EmbeddingProvider = 'local' | 'google-vertex'

/**
 * Vertex AI embedding configuration
 */
export interface VertexEmbeddingConfig {
  /**
   * Google Cloud project ID
   */
  projectId: string

  /**
   * Vertex AI region (e.g., 'us-central1')
   */
  region: string

  /**
   * Embedding model to use
   * Default: 'gemini-embedding-001'
   */
  model?: string

  /**
   * Output dimensionality (optional)
   * Default: 768 for text-embedding-004
   */
  outputDimensionality?: number
}

/**
 * Embedding Generator Configuration
 */
export interface EmbeddingConfig {
  /**
   * Embedding provider to use
   * Default: 'local'
   */
  provider?: EmbeddingProvider

  /**
   * Vertex AI configuration (required when provider is 'google-vertex')
   */
  vertex?: VertexEmbeddingConfig

  /**
   * Model to use for local embeddings
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
 * Resolved embedding configuration with defaults applied
 */
interface ResolvedEmbeddingConfig {
  provider: EmbeddingProvider
  vertex?: VertexEmbeddingConfig
  model: string
  verbose: boolean
}

/**
 * Embedding Generator
 *
 * Generates semantic embeddings for text using either:
 * 1. Local SentenceTransformers via ONNX (default)
 * 2. Google Vertex AI embeddings
 *
 * Local Model: all-MiniLM-L6-v2
 * - 384 dimensions (compact)
 * - 22.7M parameters (lightweight)
 * - ~80MB memory footprint
 * - ~5-15ms per embedding
 *
 * Vertex AI: text-embedding-004
 * - 768 dimensions (default, configurable)
 * - Cloud-based, no local model loading
 * - Requires Google Cloud authentication
 */
export class EmbeddingGenerator {
  private _config: ResolvedEmbeddingConfig
  private _localModel: any | null = null
  private _vertexClient: any | null = null
  private _loading: Promise<void> | null = null
  private _dimension: number

  constructor(config: EmbeddingConfig = {}) {
    this._config = {
      provider: config.provider ?? 'local',
      vertex: config.vertex,
      model: config.model ?? 'Xenova/all-MiniLM-L6-v2',
      verbose: config.verbose ?? true,
    }

    // Set dimension based on provider
    if (this._config.provider === 'google-vertex') {
      this._dimension = config.vertex?.outputDimensionality ?? 768
    } else {
      this._dimension = 384 // all-MiniLM-L6-v2
    }
  }

  /**
   * Get the configured provider
   */
  get provider(): EmbeddingProvider {
    return this._config.provider
  }

  /**
   * Initialize the embedding model/client
   * For local: loads the model into memory
   * For Vertex: creates the API client (no model download)
   */
  async initialize(): Promise<void> {
    if (this._config.provider === 'google-vertex') {
      await this._initializeVertex()
    } else {
      await this._initializeLocal()
    }
  }

  private async _initializeVertex(): Promise<void> {
    if (this._vertexClient) return

    if (!this._config.vertex) {
      throw new Error('Vertex AI configuration required. Set vertex.projectId and vertex.region.')
    }

    const { projectId, region } = this._config.vertex

    // Dynamic import to make @google/genai optional
    const { GoogleGenAI } = await import('@google/genai')

    this._vertexClient = new GoogleGenAI({
      vertexai: true,
      project: projectId,
      location: region,
    })

    logger.info(`Vertex AI embedding client initialized (${region})`)
  }

  private async _initializeLocal(): Promise<void> {
    if (this._localModel) return
    if (this._loading) return this._loading

    this._loading = this._loadLocalModel()
    await this._loading
  }

  private async _loadLocalModel(): Promise<void> {
    try {
      logger.info(`Loading embedding model: ${this._config.model}`)

      // Dynamic import to make transformers optional
      const { pipeline } = await import('@huggingface/transformers')

      // Create the feature extraction pipeline
      // Uses ONNX runtime for fast inference
      this._localModel = await pipeline('feature-extraction', this._config.model, {
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
   * @returns Float32Array of embedding values
   */
  async embed(text: string): Promise<Float32Array> {
    if (!text || !text.trim()) {
      return new Float32Array(this._dimension)
    }

    if (this._config.provider === 'google-vertex') {
      return this._embedWithVertex(text)
    } else {
      return this._embedWithLocal(text)
    }
  }

  private async _embedWithVertex(text: string): Promise<Float32Array> {
    // Ensure client is initialized
    if (!this._vertexClient) {
      await this._initializeVertex()
    }

    const model = this._config.vertex?.model ?? 'gemini-embedding-001'

    try {
      const response = await this._vertexClient.models.embedContent({
        model,
        contents: text.trim(),
        config: {
          taskType: 'RETRIEVAL_DOCUMENT',
          outputDimensionality: this._dimension,
        },
      })

      // Response has embeddings array (plural), get first one
      const values = response.embeddings?.[0]?.values
      if (!values || !Array.isArray(values)) {
        logger.error('No embedding values in Vertex AI response')
        return new Float32Array(this._dimension)
      }

      return new Float32Array(values)
    } catch (error) {
      logger.error(`Failed to generate Vertex AI embedding: ${error}`)
      return new Float32Array(this._dimension)
    }
  }

  private async _embedWithLocal(text: string): Promise<Float32Array> {
    // Ensure model is loaded
    if (!this._localModel) {
      await this._initializeLocal()
    }

    try {
      // Generate embedding
      const output = await this._localModel!(text.trim(), {
        pooling: 'mean',
        normalize: true,
      })

      // Extract the embedding data
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
   * Check if the model/client is loaded and ready
   */
  get isReady(): boolean {
    if (this._config.provider === 'google-vertex') {
      return this._vertexClient !== null
    }
    return this._localModel !== null
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
