import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixMissingSourceTags() {
  console.log('取得元タグが付いていない記事にタグを追加します...\n');

  try {
    // SRE記事の修正
    console.log('【SRE記事の修正】');
    const sreArticles = await prisma.article.findMany({
      where: {
        source: { name: 'SRE' }
      },
      include: {
        tags: true
      }
    });

    const expectedSRETags = ['HashiCorp', 'CNCF', 'Grafana', 'SRE Weekly'];
    
    // より詳細なパターンマッチング
    const srePatterns = [
      { 
        pattern: /HashiCorp|Terraform|Vault|Nomad|Consul|Waypoint|Boundary|Packer/i, 
        tag: 'HashiCorp' 
      },
      { 
        pattern: /CNCF|Cloud Native|Kubernetes|Prometheus|Envoy|Istio|Linkerd|Helm|Flux|KCD|k8s|containerd|CoreDNS|etcd|Fluentd|Harbor|Jaeger|NATS|OpenMetrics|OpenTelemetry|Thanos|Vitess|eBPF|Falco|gRPC|Keda|Knative|Longhorn|OPA|Open Policy Agent|Rook|SPIFFE|SPIRE|TiKV|TUF|Cilium|Contour|Crossplane|Dapr|Dragonfly|Emissary|Flagger|Fluent Bit|Flux|Gatekeeper|In-toto|Keptn|Kyverno|Notary|Open Service Mesh|OpenKruise|Pixie|SchemaHero|Serverless Devs|Telepresence|Tinkerbell|Volcano|cert-manager|CloudEvents|CNI|Container Network Interface|CRI|Container Runtime Interface|CSI|Container Storage Interface|KubeEdge|KubeVirt|Kubernetes SIG|Kustomize|Litmus|Meshery|Metal³|Network Service Mesh|OpenEBS|Operator Framework|Prometheus Operator|Service Mesh Interface|Strimzi|Submariner|Telepresence|Trickster|Virtual Kubelet|Wasm|WebAssembly|argo|ArgoCD|Backstage|Brigade|Buildpacks|Carvel|ChaosBlade|Chaos Mesh|Cloud Custodian|CloudEvents|Cluster API|Confidential Containers|Koordinator|Krator|Krustlet|Kubecost|Kuberhealthy|KubeVela|Kuma|Kured|Lens|Liqo|Litmus|ORAS|Parsec|Porter|Rancher|SOPS|Sealed Secrets|Skooner|Submariner|SuperEdge|Thanos|Tilt|Tremor|Trivy|Velero|WasmCloud|WasmEdge|kapp|kbld|kpt|minikube|kind/i, 
        tag: 'CNCF' 
      },
      { 
        pattern: /Grafana|Loki|Tempo|Mimir|Faro|Oncall|Phlare|Pyroscope|k6|xk6|ObservabilityCON/i, 
        tag: 'Grafana' 
      },
      { 
        pattern: /SRE Weekly Issue/i, 
        tag: 'SRE Weekly' 
      }
    ];

    let sreUpdatedCount = 0;
    for (const article of sreArticles) {
      const tagNames = article.tags.map(t => t.name);
      const hasSourceTag = expectedSRETags.some(tag => tagNames.includes(tag));
      
      if (!hasSourceTag) {
        let matchedTag = null;
        
        // タイトルとコンテンツでパターンマッチング
        const searchText = `${article.title} ${article.content || ''}`.substring(0, 1000);
        
        for (const { pattern, tag } of srePatterns) {
          if (pattern.test(searchText)) {
            matchedTag = tag;
            break;
          }
        }

        // デフォルトの推定（タイトルから）
        if (!matchedTag) {
          if (article.title.includes('YAML') || article.title.includes('Platform Engineer')) {
            matchedTag = 'CNCF';
          } else if (article.title.includes('visualization') || article.title.includes('monitor')) {
            matchedTag = 'Grafana';
          } else if (article.title.includes('secret') || article.title.includes('infrastructure')) {
            matchedTag = 'HashiCorp';
          }
        }

        if (matchedTag) {
          const tag = await prisma.tag.upsert({
            where: { name: matchedTag },
            update: {},
            create: { name: matchedTag }
          });

          await prisma.article.update({
            where: { id: article.id },
            data: {
              tags: {
                connect: { id: tag.id }
              }
            }
          });

          sreUpdatedCount++;
          console.log(`✓ ${article.title.substring(0, 50)}... -> +${matchedTag}`);
        } else {
          console.log(`? ${article.title.substring(0, 50)}... -> タグを推定できませんでした`);
        }
      }
    }

    console.log(`\nSRE記事: ${sreUpdatedCount}件を更新`);

    // AWS記事の修正
    console.log('\n【AWS記事の修正】');
    const awsArticles = await prisma.article.findMany({
      where: {
        source: { name: 'AWS' }
      },
      include: {
        tags: true
      }
    });

    const expectedAWSTags = ['Security Bulletins', "What's New", 'News Blog'];
    
    // より詳細なパターンマッチング
    const awsPatterns = [
      { 
        pattern: /security|CVE|AWS-\d{4}-\d{3}|vulnerability|patch|exploit|breach/i, 
        tag: 'Security Bulletins' 
      },
      { 
        pattern: /Weekly Roundup|blog|post|article|guide|tutorial|best practice|how to|deep dive|under the hood|explained|introduction|overview|journey|story|case study|customer spotlight|partner spotlight|community|open source|contribution|ecosystem|innovation|future|vision|strategy|trends|insights|analysis|research|survey|report|whitepaper|ebook|webinar|podcast|video|course|training|certification|exam|learning|education|academy|workshop|lab|hands-on|demo|sample|example|reference|template|boilerplate|starter|quickstart|getting started|setup|installation|configuration|deployment|migration|upgrade|update|release note|changelog|roadmap|preview|beta|alpha|experimental|feature|enhancement|improvement|optimization|performance|scalability|reliability|availability|durability|resilience|fault tolerance|disaster recovery|backup|restore|monitoring|logging|tracing|debugging|troubleshooting|support|help|documentation|api|sdk|cli|tool|utility|library|framework|platform|service|product|solution|offering|announcement|launch|general availability|ga|region|zone|edge|local|wavelength|outpost|hybrid|multi-cloud|cross-cloud|cloud-native|serverless|container|kubernetes|microservice|event-driven|real-time|streaming|batch|etl|data|analytics|machine learning|artificial intelligence|ai|ml|deep learning|neural network|computer vision|natural language|nlp|recommendation|personalization|prediction|forecasting|anomaly detection|fraud detection|sentiment analysis|text analysis|image recognition|object detection|face recognition|voice recognition|speech to text|text to speech|translation|transcription|chatbot|virtual assistant|conversational|dialogue|interaction|experience|interface|frontend|backend|full-stack|devops|sre|security|compliance|governance|cost|billing|pricing|free tier|savings|optimization|management|automation|orchestration|workflow|pipeline|integration|migration|modernization|transformation|innovation|digital|cloud|aws|amazon/i, 
        tag: 'News Blog' 
      },
      { 
        pattern: /now available|launches|announces|introducing|new|release|update|expand|enhance|improve|add|support|feature|capability|functionality|service|region|availability|generally available|GA|preview|beta|public preview/i, 
        tag: "What's New" 
      }
    ];

    let awsUpdatedCount = 0;
    for (const article of awsArticles) {
      const tagNames = article.tags.map(t => t.name);
      const hasSourceTag = expectedAWSTags.some(tag => tagNames.includes(tag));
      
      if (!hasSourceTag) {
        let matchedTag = null;
        
        // タイトルでパターンマッチング（AWSは主にタイトルで判断可能）
        for (const { pattern, tag } of awsPatterns) {
          if (pattern.test(article.title)) {
            matchedTag = tag;
            break;
          }
        }

        // デフォルトはWhat's New（大半の記事が新機能・アップデート）
        if (!matchedTag) {
          matchedTag = "What's New";
        }

        const tag = await prisma.tag.upsert({
          where: { name: matchedTag },
          update: {},
          create: { name: matchedTag }
        });

        await prisma.article.update({
          where: { id: article.id },
          data: {
            tags: {
              connect: { id: tag.id }
            }
          }
        });

        awsUpdatedCount++;
        console.log(`✓ ${article.title.substring(0, 50)}... -> +${matchedTag}`);
      }
    }

    console.log(`\nAWS記事: ${awsUpdatedCount}件を更新`);

    console.log('\n✅ 修正完了');

  } catch (error) {
    console.error('❌ エラーが発生しました:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

fixMissingSourceTags().catch(console.error);